#!/usr/bin/env python3
"""
EM-1D -> CST Studio Suite bridge.

Closes the loop that otherwise stops at the .bas export: feeds a macro built by
buildVba() into CST, runs the solver, and reads S-parameters back out as JSON so
the synthesised design can be checked against a real solve.

Every subcommand prints exactly one JSON object on stdout; progress notes and
CST's own chatter go to stderr, so stdout stays safe to pipe into jq or a test
harness.

    python scripts/cst_bridge.py info
    python scripts/cst_bridge.py build   --macro rect.bas --project work/rect.cst
    python scripts/cst_bridge.py solve   --project work/rect.cst
    python scripts/cst_bridge.py results --project work/rect.cst
    python scripts/cst_bridge.py run     --macro rect.bas --project work/rect.cst

By default this attaches to an already-running CST Design Environment (starting
one only if none is up); pass --new to force a private instance instead.

Pass --quiet on any command that edits the model. A history change which
invalidates existing results raises a modal "Results May Get Incompatible With
Model" dialog, and CST blocks there indefinitely -- the call simply never
returns, with no error and nothing in the solver log. Quiet mode auto-answers it.
The same applies to VBA errors, which open a modal "History Error" box; if a
build or solve hangs with no log activity, look for a dialog before assuming the
solver is busy.

Requires CST Studio Suite 2024 and a CPython whose minor version matches one of
the shipped _cst_interface.cpXY-win_amd64.pyd files -- 3.10 on this machine:

    "C:\\Program Files\\Python310\\python.exe" scripts/cst_bridge.py info
"""

from __future__ import annotations

import argparse
import glob
import json
import math
import os
import re
import sys
import traceback

# ---------------------------------------------------------------------------
# 1. Locating CST and bootstrapping the shipped python package
# ---------------------------------------------------------------------------

# Only roots that actually carry AMD64/python_cst_libraries qualify, which is
# what makes this skip the "CST Studio Suite 2026" stub directory on this
# machine (licence-manager leftovers, no executable and no python libraries).
_ROOT_GLOBS = (
    r"C:\Program Files\CST Studio Suite 20*",
    r"C:\Program Files (x86)\CST Studio Suite 20*",
)


def _candidate_roots(explicit=None):
    if explicit:
        yield explicit
        return
    if os.environ.get("CST_HOME"):
        yield os.environ["CST_HOME"]
    seen = set()
    for pattern in _ROOT_GLOBS:
        # Newest version first.
        for path in sorted(glob.glob(pattern), reverse=True):
            if path not in seen:
                seen.add(path)
                yield path


def find_cst_root(explicit=None):
    """Return the newest CST install that actually exposes the python API."""
    tried = []
    for root in _candidate_roots(explicit):
        libs = os.path.join(root, "AMD64", "python_cst_libraries")
        tried.append(root)
        if os.path.isdir(libs):
            return root, libs
    raise RuntimeError(
        "No CST install with AMD64/python_cst_libraries found. Tried: "
        + (", ".join(tried) or "<nothing>")
        + ". Pass --cst-root or set CST_HOME."
    )


def load_cst(explicit=None):
    """Put the CST python package on sys.path and import it."""
    root, libs = find_cst_root(explicit)
    if libs not in sys.path:
        sys.path.append(libs)

    tag = f"cp{sys.version_info.major}{sys.version_info.minor}"
    if not glob.glob(os.path.join(root, "AMD64", f"_cst_interface.{tag}-win_amd64.pyd")):
        available = sorted(
            re.findall(
                r"_cst_interface\.cp(\d)(\d+)-win_amd64\.pyd",
                " ".join(os.listdir(os.path.join(root, "AMD64"))),
            )
        )
        pretty = ", ".join(f"{a}.{b}" for a, b in available) or "none"
        raise RuntimeError(
            f"CST at {root} ships no _cst_interface for python "
            f"{sys.version_info.major}.{sys.version_info.minor}. "
            f"Available: {pretty}. Re-run with a matching interpreter."
        )

    import cst.interface  # noqa: F401  (also puts AMD64/ on sys.path)
    import cst.results

    return root, cst.interface, cst.results


def note(msg):
    print(msg, file=sys.stderr, flush=True)


# ---------------------------------------------------------------------------
# 2. Macro handling
# ---------------------------------------------------------------------------

_SUB_MAIN = re.compile(r"^\s*sub\s+main\s*$", re.I)
_END_SUB = re.compile(r"^\s*end\s+sub\s*$", re.I)
_OPTION = re.compile(r"^\s*option\s+explicit\s*$", re.I)


def macro_body(text):
    """Strip the Option Explicit / Sub Main / End Sub scaffolding.

    add_to_history() wants the bare command body; _execute_vba_code() wants the
    whole Sub Main wrapper. We keep the leading comment header either way -- it
    carries the synthesised metrics and is worth having in the CST history tree.
    """
    kept = [
        ln
        for ln in text.splitlines()
        if not (_SUB_MAIN.match(ln) or _END_SUB.match(ln) or _OPTION.match(ln))
    ]
    return "\n".join(kept).strip("\n")


def apply_macro(prj, text, header="EM-1D synthesised antenna", timeout=None, mode="auto"):
    """Push a macro into the model.

    Three shapes need different handling:

    - The generic templates (rect, dipole, disk, ...) emit plain modelling
      commands, so the whole body goes in as one history block. That keeps the
      model rebuildable and parameter sweeps meaningful.
    - The concentric-ring and serpentine templates already organise themselves
      into AddToHistory blocks. Nesting those inside another history entry would
      double them up, so they run as a macro and land in history on their own
      terms.
    - Parameter edits (StoreDoubleParameter + Rebuild) must *execute* and touch
      nothing else. Appending them to history would re-run them on every
      subsequent rebuild, pinning the parameter and silently defeating sweeps.
      Force this with mode='execute'.
    """
    body = macro_body(text)
    if mode == "execute" or (mode == "auto" and re.search(r"\bAddToHistory\b", body, re.I)):
        prj.model3d._execute_vba_code(f"sub main\n{body}\nend sub")
        return "execute_vba_code"
    prj.model3d.add_to_history(header, body, timeout=timeout)
    return "add_to_history"


# ---------------------------------------------------------------------------
# 3. Sessions and projects
# ---------------------------------------------------------------------------


def open_environment(ci, new=False, quiet=False):
    """Attach to a running Design Environment, or start one."""
    if new:
        note("starting a private CST Design Environment ...")
        de = ci.DesignEnvironment.new()
    else:
        running = ci.running_design_environments()
        note(
            f"attaching to running CST (pids: {running})"
            if running
            else "no CST running; starting one ..."
        )
        de = ci.DesignEnvironment.connect_to_any_or_new()
    if quiet:
        de.set_quiet_mode(True)
    return de


def open_or_create_project(de, path):
    """Open an existing .cst, or create a fresh Microwave Studio project."""
    path = os.path.abspath(path)
    if os.path.exists(path):
        note(f"opening {path}")
        return de.open_project(path), False
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    note(f"creating new MWS project at {path}")
    prj = de.new_mws()
    prj.save(path, allow_overwrite=True)
    return prj, True


def project_messages(prj):
    try:
        msgs = prj.get_messages()
    except Exception:
        return []
    if msgs is None:
        return []
    if isinstance(msgs, str):
        return [msgs]
    try:
        return [str(m) for m in msgs]
    except TypeError:
        return [str(msgs)]


# ---------------------------------------------------------------------------
# 4. Reading results back
# ---------------------------------------------------------------------------


def _to_db(value):
    mag = abs(complex(value))
    return 20.0 * math.log10(mag) if mag > 0 else -999.0


def _crossing(f_a, db_a, f_b, db_b, level=-10.0):
    """Linear interpolation of the frequency where the trace crosses `level`."""
    if db_b == db_a:
        return f_a
    return f_a + (level - db_a) * (f_b - f_a) / (db_b - db_a)


def find_dips(freqs, db, floor=-3.0):
    """Every local minimum in the trace, shallowest filtered out.

    A resonant loop is multi-resonant (perimeter = n*lambda_g), so the deepest dip
    is frequently a higher-order mode rather than the fundamental. Reporting only
    the global minimum makes a correctly-tuned antenna look mistuned -- and makes
    resonance appear to move the wrong way as the loop is scaled.
    """
    out = []
    for i in range(1, len(freqs) - 1):
        if db[i] <= db[i - 1] and db[i] < db[i + 1] and db[i] < floor:
            out.append({"freqGHz": freqs[i], "s11dB": db[i]})
    return out


def summarize_s11(freqs, values, level=-10.0, near_ghz=None):
    """Resonance and -10 dB band, for comparison against the synthesised metrics.

    The band reported is the contiguous one containing the chosen dip, not the
    union of every dip -- a multi-resonant design should not read as one
    improbably wide match. With `near_ghz`, the dip nearest that frequency is
    chosen instead of the deepest one; use it whenever a specific band is the
    design target, or a higher-order mode will hijack the summary.
    """
    if not freqs or not values or len(freqs) != len(values):
        return None
    db = [_to_db(v) for v in values]
    dips = find_dips(freqs, db)

    if near_ghz is not None and dips:
        pick = min(dips, key=lambda d: abs(d["freqGHz"] - near_ghz))
        i_min = min(range(len(freqs)), key=lambda i: abs(freqs[i] - pick["freqGHz"]))
    else:
        i_min = min(range(len(db)), key=lambda i: db[i])
    out = {
        "resonantFreqGHz": freqs[i_min],
        "minS11dB": db[i_min],
        "points": len(freqs),
        "spanGHz": [freqs[0], freqs[-1]],
        "dips": dips,
        "pickedNearest": near_ghz,
    }

    if db[i_min] > level:
        out["matched"] = False
        return out
    out["matched"] = True

    lo = freqs[0]
    for i in range(i_min, 0, -1):
        if db[i - 1] > level:
            lo = _crossing(freqs[i - 1], db[i - 1], freqs[i], db[i], level)
            break
    hi = freqs[-1]
    for i in range(i_min, len(freqs) - 1):
        if db[i + 1] > level:
            hi = _crossing(freqs[i], db[i], freqs[i + 1], db[i + 1], level)
            break

    centre = 0.5 * (lo + hi)
    out["bandLowGHz"] = lo
    out["bandHighGHz"] = hi
    out["bandwidthGHz"] = hi - lo
    out["bandwidthPct"] = 100.0 * (hi - lo) / centre if centre else None
    out["edgeLimited"] = lo <= freqs[0] or hi >= freqs[-1]
    return out


def read_efficiencies(mod, items, run_id=0, at_ghz=None):
    """Read every efficiency trace in the tree, in dB and %.

    CST files these under '1D Results\\Efficiencies' as 'Rad. Efficiency [1]' and
    'Tot. Efficiency [1]'. They are sampled only at far-field monitor frequencies,
    so a trace may hold just one or two points -- `at_ghz` picks the sample
    nearest the frequency of interest and reports how far off it landed, because
    reading efficiency far from where it was monitored is exactly the mistake
    that makes an untuned model look like a lossy one.
    """
    out = []
    for tp in items:
        if "efficien" not in tp.lower():
            continue
        try:
            item = mod.get_result_item(tp, run_id)
            xs = [float(x) for x in item.get_xdata()]
            ys = [float(abs(complex(y))) for y in item.get_ydata()]
        except Exception as exc:
            out.append({"treepath": tp, "error": str(exc)})
            continue
        if not xs:
            continue

        # CST reports efficiency either linearly or already in dB depending on the
        # tree item; values <= 0 with magnitude > 1 are unambiguously dB.
        rec = {"treepath": tp, "points": len(xs)}
        idx = 0
        if at_ghz is not None:
            idx = min(range(len(xs)), key=lambda i: abs(xs[i] - at_ghz))
            rec["requestedGHz"] = at_ghz
            rec["offByGHz"] = abs(xs[idx] - at_ghz)
        val = ys[idx]
        rec["freqGHz"] = xs[idx]
        if val <= 0:
            rec["dB"] = val
            rec["percent"] = 100.0 * (10 ** (val / 10.0))
        else:
            rec["percent"] = 100.0 * val
            rec["dB"] = 10.0 * math.log10(val) if val > 0 else None
        rec["all"] = [
            {"freqGHz": f, "value": v} for f, v in zip(xs, ys)
        ]
        out.append(rec)
    return out


def read_power(mod, items, run_id=0, at_ghz=None):
    """Read the power balance: stimulated / accepted / radiated, and loss per material.

    This is what decides whether a shielding layer (AMC) can help. If the loss is
    dominated by 'Volume loss in Skin/Fat/Muscle' then the power is going into the
    body and isolating from it recovers efficiency. If it sits in the substrate or
    the EGaIn, no amount of backing will fix it.
    """
    out = []
    for tp in items:
        if "\\Power\\" not in tp:
            continue
        try:
            item = mod.get_result_item(tp, run_id)
            xs = [float(x) for x in item.get_xdata()]
            ys = [float(abs(complex(y))) for y in item.get_ydata()]
        except Exception:
            continue
        if not xs:
            continue
        idx = 0
        if at_ghz is not None:
            idx = min(range(len(xs)), key=lambda i: abs(xs[i] - at_ghz))
        out.append({
            "label": tp.split("\\")[-1] if "Loss per Material" not in tp
            else "loss: " + tp.split("\\")[-1],
            "treepath": tp,
            "freqGHz": xs[idx],
            "value": ys[idx],
        })
    return out


def read_results(cr, path, treepath=None, run_id=0, level=-10.0, trace=False,
                 eff_at_ghz=None):
    """Pull the 1D result tree, and summarise S1,1 if it is there."""
    pf = cr.ProjectFile(os.path.abspath(path), allow_interactive=True)
    mod = pf.get_3d()

    try:
        items = list(mod.get_tree_items("0D/1D"))
    except Exception as exc:  # solver never ran, or no results yet
        return {"treeItems": [], "s11": None, "error": str(exc)}

    out = {"treeItems": items, "runIds": [], "s11": None}
    try:
        out["runIds"] = list(mod.get_all_run_ids())
    except Exception:
        pass
    out["efficiencies"] = read_efficiencies(mod, items, run_id, eff_at_ghz)
    out["power"] = read_power(mod, items, run_id, eff_at_ghz)

    wanted = treepath
    if wanted is None:
        # CST tree paths use backslashes. Several branches carry an "S1,1" leaf --
        # "Adaptive Meshing\f=...\S-Parameters\S1,1" is indexed by mesh *pass*, not
        # frequency, and silently produces a nonsense 3-point "sweep" if picked. Take
        # the top-level result and never a diagnostic branch.
        preferred = "1D Results\\S-Parameters\\S1,1"
        if preferred in items:
            wanted = preferred
        else:
            for candidate in items:
                if re.search(r"Adaptive Meshing|Convergence", candidate, re.I):
                    continue
                if re.search(r"S-Parameters.*S1,\s*1\s*$", candidate):
                    wanted = candidate
                    break
    if wanted is None:
        return out

    out["treepath"] = wanted
    item = mod.get_result_item(wanted, run_id)
    freqs = [float(x) for x in item.get_xdata()]
    values = list(item.get_ydata())

    out["s11"] = summarize_s11(freqs, values, level, near_ghz=eff_at_ghz)
    if out["s11"] is not None:
        out["s11"]["xlabel"] = item.xlabel
        out["s11"]["ylabel"] = item.ylabel
    if trace:
        out["trace"] = {
            "freqGHz": freqs,
            "s11dB": [_to_db(v) for v in values],
        }
    return out


# ---------------------------------------------------------------------------
# 5. Subcommands
# ---------------------------------------------------------------------------


def cmd_info(args):
    root, ci, cr = load_cst(args.cst_root)
    exe = os.path.join(root, "CST DESIGN ENVIRONMENT.exe")
    running = list(ci.running_design_environments())
    out = {
        "ok": True,
        "cstRoot": root,
        "cstExe": exe if os.path.exists(exe) else None,
        "python": sys.version.split()[0],
        "runningDesignEnvironments": running,
        "resultsVersion": cr.get_version_info(),
    }
    if running and args.probe:
        de = ci.DesignEnvironment.connect_to_any()
        out["version"] = de.version
        out["openProjects"] = list(de.list_open_projects())
    return out


def cmd_build(args):
    _, ci, _ = load_cst(args.cst_root)
    with open(args.macro, encoding="utf-8") as fh:
        macro = fh.read()

    de = open_environment(ci, new=args.new, quiet=args.quiet)
    prj, created = open_or_create_project(de, args.project)
    method = apply_macro(
        prj, macro, header=args.header, timeout=args.timeout, mode=args.mode
    )
    if args.rebuild:
        prj.model3d.full_history_rebuild(timeout=args.timeout)
    prj.save(allow_overwrite=True)

    return {
        "ok": True,
        "project": prj.filename(),
        "createdProject": created,
        "macro": os.path.abspath(args.macro),
        "method": method,
        "messages": project_messages(prj),
    }


def cmd_solve(args):
    _, ci, _ = load_cst(args.cst_root)
    de = open_environment(ci, new=args.new, quiet=args.quiet)
    prj, _ = open_or_create_project(de, args.project)

    note("running solver (this blocks until CST finishes) ...")
    prj.model3d.run_solver(timeout=args.timeout)
    prj.save(allow_overwrite=True)

    info = None
    try:
        info = prj.model3d.get_solver_run_info()
    except Exception:
        pass
    return {
        "ok": True,
        "project": prj.filename(),
        "solver": prj.model3d.get_active_solver_name(),
        "runInfo": info,
        "messages": project_messages(prj),
    }


def cmd_results(args):
    _, _, cr = load_cst(args.cst_root)
    res = read_results(
        cr,
        args.project,
        treepath=args.treepath,
        run_id=args.run_id,
        level=args.level,
        trace=args.trace,
        eff_at_ghz=args.eff_at,
    )
    res["ok"] = "error" not in res
    res["project"] = os.path.abspath(args.project)
    return res


def cmd_run(args):
    """build + solve + results, the whole loop in one call."""
    built = cmd_build(args)
    solved = cmd_solve(args)
    _, _, cr = load_cst(args.cst_root)
    res = read_results(
        cr,
        args.project,
        treepath=args.treepath,
        run_id=args.run_id,
        level=args.level,
        trace=args.trace,
        eff_at_ghz=args.eff_at,
    )
    return {
        "ok": True,
        "build": built,
        "solve": solved,
        "results": res,
    }


# ---------------------------------------------------------------------------
# 6. CLI
# ---------------------------------------------------------------------------


def main(argv=None):
    ap = argparse.ArgumentParser(
        description="Drive CST Studio Suite from an EM-1D macro export.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    ap.add_argument("--cst-root", help="override the CST install directory")
    ap.add_argument(
        "--new",
        action="store_true",
        help="start a private Design Environment instead of attaching to a running one",
    )
    ap.add_argument("--quiet", action="store_true", help="put CST in quiet mode")
    ap.add_argument("--timeout", type=int, default=None, help="per-call timeout, seconds")
    sub = ap.add_subparsers(dest="cmd", required=True)

    def add_project(p):
        p.add_argument("--project", required=True, help="path to the .cst project")

    def add_macro(p):
        p.add_argument("--macro", required=True, help="path to the .bas/.vba export")
        p.add_argument("--header", default="EM-1D synthesised antenna", help="history block title")
        p.add_argument("--rebuild", action="store_true", help="full history rebuild after applying")
        p.add_argument(
            "--mode",
            choices=("auto", "history", "execute"),
            default="auto",
            help="auto: history block, or execute if the macro already calls AddToHistory. "
            "execute: run as a macro without touching history (use for parameter edits).",
        )

    def add_results(p):
        p.add_argument("--treepath", default=None, help="result tree path (default: auto-find S1,1)")
        p.add_argument("--run-id", type=int, default=0)
        p.add_argument("--level", type=float, default=-10.0, help="dB level for bandwidth")
        p.add_argument("--trace", action="store_true", help="include the full S11 trace")
        p.add_argument(
            "--eff-at",
            type=float,
            default=None,
            metavar="GHZ",
            help="report efficiency at the monitor sample nearest this frequency, "
            "and how far off that sample landed",
        )

    p = sub.add_parser("info", help="report the detected install and running sessions")
    p.add_argument("--probe", action="store_true", help="also attach and list open projects")
    p.set_defaults(func=cmd_info)

    p = sub.add_parser("build", help="apply a macro into a project")
    add_project(p)
    add_macro(p)
    p.set_defaults(func=cmd_build)

    p = sub.add_parser("solve", help="run the solver on a project")
    add_project(p)
    p.set_defaults(func=cmd_solve)

    p = sub.add_parser("results", help="read S-parameters out of a solved project")
    add_project(p)
    add_results(p)
    p.set_defaults(func=cmd_results)

    p = sub.add_parser("run", help="build + solve + results")
    add_project(p)
    add_macro(p)
    add_results(p)
    p.set_defaults(func=cmd_run)

    args = ap.parse_args(argv)

    # The CST libraries print chatter straight to stdout ("You are working in
    # interactive mode", licence notices). That corrupts the JSON for anything
    # downstream, so send everything the command emits to stderr and keep the real
    # stdout for the payload alone.
    real_stdout = sys.stdout
    sys.stdout = sys.stderr
    try:
        result = args.func(args)
    except Exception as exc:
        sys.stdout = real_stdout
        traceback.print_exc(file=sys.stderr)
        json.dump(
            {"ok": False, "error": str(exc), "errorType": type(exc).__name__},
            real_stdout,
            indent=2,
        )
        print(file=real_stdout)
        return 1
    finally:
        sys.stdout = real_stdout
    json.dump(result, real_stdout, indent=2, default=str)
    print(file=real_stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
