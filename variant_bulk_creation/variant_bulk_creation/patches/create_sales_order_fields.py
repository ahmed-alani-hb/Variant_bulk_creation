# SPDX-License-Identifier: MIT
"""Patch to add helper fields on the Sales Order Item table for variant selection."""

from __future__ import annotations

from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
    """Create (or update) Sales Order Item custom fields for variant attributes."""

    fields = {
        "Sales Order Item": [
            {
                "fieldname": "vbc_profile",
                "label": "Profile (Template Item)",
                "fieldtype": "Link",
                "options": "Item",
                "insert_after": "item_code",
                "in_list_view": 1,
            },
            {
                "fieldname": "vbc_attribute_value_1",
                "label": "Attribute Value 1",
                "fieldtype": "Link",
                "options": "Item Attribute Value",
                "insert_after": "vbc_profile",
                "in_list_view": 1,
            },
            {
                "fieldname": "vbc_attribute_value_2",
                "label": "Attribute Value 2",
                "fieldtype": "Link",
                "options": "Item Attribute Value",
                "insert_after": "vbc_attribute_value_1",
                "in_list_view": 1,
            },
            {
                "fieldname": "vbc_attribute_value_3",
                "label": "Attribute Value 3",
                "fieldtype": "Link",
                "options": "Item Attribute Value",
                "insert_after": "vbc_attribute_value_2",
                "in_list_view": 1,
            },
            {
                "fieldname": "vbc_powder_code",
                "label": "Powder Coat",
                "fieldtype": "Link",
                "options": "Item Attribute Value",
                "insert_after": "vbc_attribute_value_3",
                "in_list_view": 1,
            },
            {
                "fieldname": "vbc_sticker",
                "label": "Sticker",
                "fieldtype": "Link",
                "options": "Item Attribute Value",
                "insert_after": "vbc_powder_code",
                "in_list_view": 1,
            },
            {
                "fieldname": "vbc_length",
                "label": "Length",
                "fieldtype": "Float",
                "insert_after": "vbc_sticker",
                "in_list_view": 1,
            },
        ]
    }

    create_custom_fields(fields, ignore_validate=True)
