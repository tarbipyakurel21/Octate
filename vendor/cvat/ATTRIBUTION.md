# CVAT attribution

Octate's canvas adapter and interaction model are informed by CVAT Canvas and CVAT Canvas3D.

CVAT is Copyright (C) CVAT.ai Corporation and contributors and is licensed under the MIT License. The complete pre-refactor CVAT-derived source and its original notices are preserved in Git commit `441c9f9`. Any CVAT source later adapted into this vendor boundary must retain its original copyright notice and MIT license.

Source: https://github.com/cvat-ai/cvat

The application-specific `CvatCanvasAdapter` is an original isolation layer. CVAT-specific object-state concepts must not escape that boundary. Canvas3D remains isolated and is not loaded by the primary 2D workflow.
