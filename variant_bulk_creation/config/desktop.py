# SPDX-License-Identifier: MIT

from __future__ import annotations

from frappe import _


def get_data():
    return [
        {
            "module_name": "Variant Bulk Creation",
            "category": "Modules",
            "label": _("Variant Bulk Creation"),
            "color": "#5E64FF",
            "icon": "octicon octicon-package",
            "type": "module",
            "description": _("Utilities to streamline Item Variant creation."),
        }
    ]
