"""Add Template Item and Attribute Value custom fields to Sales Order Item."""

from __future__ import annotations

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field


FIELDS = [
    {
        "fieldname": "template_item",
        "label": "Template Item",
        "fieldtype": "Link",
        "options": "Item",
        "insert_after": "item_code",
        "reqd": 0,
        "allow_in_quick_entry": 1,
    },
    {
        "fieldname": "attribute_value",
        "label": "Attribute Value",
        "fieldtype": "Link",
        "options": "Item Attribute Value",
        "insert_after": "template_item",
        "depends_on": "eval:doc.template_item",
        "allow_in_quick_entry": 1,
    },
]


def _upsert_custom_field(field: dict) -> None:
    existing = frappe.db.get_value(
        "Custom Field", {"dt": "Sales Order Item", "fieldname": field["fieldname"]}, "name"
    )

    if existing:
        doc = frappe.get_doc("Custom Field", existing)
        doc.update(field)
        doc.flags.ignore_validate = True
        doc.save()
        return

    definition = field.copy()
    definition.update({
        "dt": "Sales Order Item",
        "hide_days": 0,
        "hidden": 0,
    })
    create_custom_field(definition, ignore_validate=True)


def execute():
    for field in FIELDS:
        _upsert_custom_field(field)
