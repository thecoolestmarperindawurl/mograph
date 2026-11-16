"""Run one OpenMontage tool as a separate program and print its result as JSON.

mograph does not bundle OpenMontage (AGPL-3.0); it calls a checkout the user installed
(`mograph openmontage setup`) through this bridge: argv = <openmontage dir> <module:Class> <inputs json>.
"""
import importlib, json, os, sys

om, target, inputs = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
sys.path.insert(0, om)
os.chdir(om)
mod, cls = target.split(':')
try:
    tool = getattr(importlib.import_module(mod), cls)()
    r = tool.execute(inputs)
    out = {'success': bool(r.success), 'data': r.data, 'artifacts': r.artifacts, 'error': r.error}
except Exception as e:  # report instead of a traceback wall
    out = {'success': False, 'error': f'{type(e).__name__}: {e}'}
print('@@OM@@' + json.dumps(out, default=str))
