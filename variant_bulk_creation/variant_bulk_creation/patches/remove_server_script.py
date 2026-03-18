# SPDX-License-Identifier: MIT
"""Remove broken Server Script that uses unavailable frappe.get_roles API.

Permissions for Item Attribute Value are handled via Custom DocPerm
records created by setup_permissions.py instead.
"""

from __future__ import annotations

import frappe


def execute():
    script_name = "allow_sales_user_to_access_item_attribute_value"

    if frappe.db.exists("Server Script", script_name):
        frappe.delete_doc("Server Script", script_name, ignore_permissions=True)
        frappe.db.commit()

    # Also clean up the vbc_ prefixed custom fields from Sales Order Item
    # that were created by the old create_sales_order_fields patch
    vbc_fields = [
        "Sales Order Item-vbc_template_item",
        "Sales Order Item-vbc_powder_code",
        "Sales Order Item-vbc_sticker",
        "Sales Order Item-vbc_length",
        "Sales Order Item-total_pcs",
        "Sales Order Item-attribute_value",
    ]

    for field_name in vbc_fields:
        if frappe.db.exists("Custom Field", field_name):
            frappe.delete_doc("Custom Field", field_name, ignore_permissions=True)

    frappe.db.commit()
