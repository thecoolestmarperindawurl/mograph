# Third-party notices

- `three.min.js` — three.js r187 (https://threejs.org), MIT License, see `three-LICENSE.txt`. Bundled unmodified into one script.
- Some motion defaults in mograph (titles hold still once landed, moving accents only on strong beats, the dip-cut
  transition, the grey-to-ink word reveal, a final hold of at least 2 s) follow the motion guidance published in
  HyperFrames by HeyGen (https://github.com/heygen-com/hyperframes, Apache License 2.0). No HyperFrames code is included.
- Background removal uses ONNX models published in rembg's releases (https://github.com/danielgatis/rembg): U²-Net (Apache-2.0)
  and IS-Net / DIS (Apache-2.0), run with onnxruntime-web (MIT). Models are downloaded on first use, not bundled.
- 3D emoji: Microsoft Fluent Emoji (MIT) via the `@lobehub/fluent-emoji-3d` npm package (MIT), installed on first use.
- Archivo font (SIL Open Font License 1.1), see `fonts/OFL-Archivo.txt`.

## OpenMontage (not bundled)

Optional add-on, AGPL-3.0, https://github.com/calesthio/OpenMontage. Not distributed with mograph: `mograph openmontage setup` clones it into the user's cache and mograph runs its tools as a separate process (`scripts/om_bridge.py`).
