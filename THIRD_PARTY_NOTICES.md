# Third-party notices

This application bundles Google MediaPipe Tasks Vision 1.1.1 and Google's Pose Landmarker Full float16 revision 1 model. MediaPipe is a Google project released under the Apache License 2.0. A copy of the licence is included at `vendor/LICENSE`.

Runtime source: https://github.com/google-ai-edge/mediapipe

Runtime package: https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-1.1.1.tgz

Package SHA-512 integrity (verified before extraction):
`jwntgT5tzDrKOkqg6xNDNpRcTUnGvmylZE5DFnzPXossiWOIDdZX+C81LI75hlXhsG58YZW+lGzcmjH1qrQE/Q==`

Model: https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task

Model documentation: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker

The skeleton topology follows MediaPipe's published landmark connections. All application UI, angle processing and control code in this repository is independently written. The user-facing layout is inspired by Vivek's Knee Recovery: https://viviscool.github.io/knee_recovery/ . No endorsement is implied.
