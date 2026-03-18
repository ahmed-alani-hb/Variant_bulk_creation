"""Setup permissions for Item Attribute Value doctype.

This module ensures that users with Sales, Stock, and Manufacturing roles
can read and select Item Attribute Value records, which is required for
the variant creation functionality.
"""

from __future__ import annotations

import frappe


def setup_item_attribute_value_permissions():
    """Grant read permissions on Item Attribute Value to necessary roles."""

    roles = [
        "Sales User",
        "Sales Manager",
        "Stock User",
        "Stock Manager",
        "Manufacturing User",
        "Manufacturing Manager",
    ]

    for role in roles:
        # Check if permission already exists
        existing = frappe.db.exists(
            "Custom DocPerm",
            {
                "parent": "Item Attribute Value",
                "role": role,
            }
        )

        if existing:
            continue

        # Create permission record
        perm = frappe.get_doc({
            "doctype": "Custom DocPerm",
            "parent": "Item Attribute Value",
            "parenttype": "DocType",
            "parentfield": "permissions",
            "role": role,
            "read": 1,
            "select": 1,
            "permlevel": 0,
        })

        perm.insert(ignore_permissions=True)
        frappe.db.commit()

    frappe.msgprint(
        "Item Attribute Value permissions have been set up for variant creation.",
        alert=True
    )


def execute():
    """Execute permission setup (for use in migrations or manual execution)."""
    setup_item_attribute_value_permissions()
