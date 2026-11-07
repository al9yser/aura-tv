#!/usr/bin/env python3
"""Run after `npx cap add android`. Makes the generated project TV-ready and applies branding.
Fails loudly (non-zero exit) if the generated manifest is not what we expect."""
import os, shutil, sys
import xml.etree.ElementTree as ET

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ANDROID = os.environ.get('ANDROID_DIR', os.path.join(ROOT, 'android'))
MAIN = os.path.join(ANDROID, 'app', 'src', 'main')
MANIFEST = os.path.join(MAIN, 'AndroidManifest.xml')
A = 'http://schemas.android.com/apk/res/android'
ET.register_namespace('android', A)
ET.register_namespace('tools', 'http://schemas.android.com/tools')

def fail(msg):
    print('PATCH FAILED:', msg, file=sys.stderr)
    sys.exit(1)

if not os.path.exists(MANIFEST):
    fail(f'manifest not found: {MANIFEST}')

tree = ET.parse(MANIFEST)
root = tree.getroot()
app = root.find('application')
if app is None:
    fail('<application> missing')

def q(name): return '{%s}%s' % (A, name)

# --- application attributes
app.set(q('usesCleartextTraffic'), 'true')   # many IPTV servers are plain http
app.set(q('supportsRtl'), 'true')
app.set(q('banner'), '@drawable/banner')      # Android TV launcher banner
app.set(q('hardwareAccelerated'), 'true')

# --- permissions + features (touchscreen optional => installs on TV boxes)
def ensure(tag, name, **extra):
    for el in root.findall(tag):
        if el.get(q('name')) == name:
            return
    el = ET.Element(tag)
    el.set(q('name'), name)
    for k, v in extra.items():
        el.set(q(k), v)
    # keep them before <application>
    root.insert(list(root).index(app), el)

ensure('uses-permission', 'android.permission.INTERNET')
ensure('uses-permission', 'android.permission.ACCESS_NETWORK_STATE')
ensure('uses-permission', 'android.permission.WAKE_LOCK')
ensure('uses-feature', 'android.hardware.touchscreen', required='false')
ensure('uses-feature', 'android.software.leanback', required='false')

# --- Leanback launcher category on the main activity
main_act = None
for act in app.findall('activity'):
    for f in act.findall('intent-filter'):
        cats = [c.get(q('name')) for c in f.findall('category')]
        if 'android.intent.category.LAUNCHER' in cats:
            main_act = (act, f, cats)
if not main_act:
    fail('launcher activity not found')
act, flt, cats = main_act
if 'android.intent.category.LEANBACK_LAUNCHER' not in cats:
    c = ET.SubElement(flt, 'category')
    c.set(q('name'), 'android.intent.category.LEANBACK_LAUNCHER')
act.set(q('screenOrientation'), 'unspecified')

tree.write(MANIFEST, encoding='utf-8', xml_declaration=True)

# --- verify what we wrote
chk = ET.parse(MANIFEST).getroot()
txt = open(MANIFEST, encoding='utf-8').read()
for needle in ['usesCleartextTraffic="true"', 'LEANBACK_LAUNCHER', 'android.software.leanback', 'android.permission.INTERNET', '@drawable/banner']:
    if needle not in txt:
        fail(f'verification: "{needle}" missing from manifest')

# --- branding resources
src = os.path.join(ROOT, 'resources', 'android', 'res')
if not os.path.isdir(src):
    fail('resources/android/res missing (run scripts/make_icons.py)')
n = 0
for dp, _, files in os.walk(src):
    for fn in files:
        rel = os.path.relpath(os.path.join(dp, fn), src)
        dst = os.path.join(MAIN, 'res', rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(os.path.join(dp, fn), dst)
        n += 1
print(f'patched manifest + copied {n} resource files')
