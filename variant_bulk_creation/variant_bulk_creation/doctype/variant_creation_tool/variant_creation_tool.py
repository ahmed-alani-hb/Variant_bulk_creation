# SPDX-License-Identifier: MIT
"""Server-side logic for the Variant Creation Tool."""

from __future__ import annotations

from typing import Dict, Iterable, List, Sequence

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.rename_doc import rename_doc

try:
    from erpnext.controllers.item_variant import create_variant, get_variant
except ImportError as exc:  # pragma: no cover - ERPNext not available in tests
    raise ImportError(
        "Variant Creation Tool requires ERPNext to be installed to create item variants."
    ) from exc


def _get_template_context(template_item: str) -> frappe._dict:
    """Return the variant attribute metadata for the provided template item."""
    if not template_item:
        frappe.throw(_("Template Item is required."))

    item = frappe.get_doc("Item", template_item)
    if not item.has_variants:
        frappe.throw(
            _("Template {0} is not configured to create variants.").format(
                frappe.bold(item.name)
            )
        )

    attributes = [row for row in item.get("attributes", []) if row.get("attribute")]
    if len(attributes) != 1:
        frappe.throw(
            _("Template {0} must have exactly one variant attribute to use this tool.").format(
                frappe.bold(item.name)
            )
        )

    attribute = attributes[0]
    attribute_name = attribute.attribute

    allowed_values = frappe.get_all(
        "Item Attribute Value",
        filters={"parent": attribute_name},
        fields=["attribute_value", "abbr"],
        order_by="idx asc",
    )
    if not allowed_values:
        frappe.throw(
            _("Item Attribute {0} does not have any values configured.").format(
                frappe.bold(attribute_name)
            )
        )

    return frappe._dict(
        {
            "attribute": attribute_name,
            "values": allowed_values,
            "template_name": item.get("item_name") or item.name,
        }
    )


class VariantCreationTool(Document):
    """Client side orchestrates the tool; server logic lives in helpers below."""

    pass


@frappe.whitelist()
def fetch_template_details(template_item: str) -> frappe._dict:
    """Return attribute metadata and helper text for the selected template item."""

    context = _get_template_context(template_item)
    value_labels = ", ".join(
        value.get("attribute_value")
        for value in context.values
        if value.get("attribute_value")
    )
    return frappe._dict(
        {
            "attribute": context.attribute,
            "template_name": context.template_name,
            "values": context.values,
            "value_labels": value_labels,
        }
    )


def _validate_rows(rows: Sequence[Dict], allowed_values: Iterable[str]) -> None:
    """Ensure every row includes a valid attribute value."""

    allowed = set(allowed_values)
    missing = [idx + 1 for idx, row in enumerate(rows) if not row.get("attribute_value")]
    if missing:
        frappe.throw(
            _("Attribute Value is required in rows: {0}").format(", ".join(map(str, missing)))
        )

    invalid = [
        (idx + 1, row.get("attribute_value"))
        for idx, row in enumerate(rows)
        if row.get("attribute_value") and row.get("attribute_value") not in allowed
    ]
    if invalid:
        formatted = ", ".join(f"{row}: {value}" for row, value in invalid)
        frappe.throw(
            _("Attribute values outside the template definition were provided: {0}").format(
                formatted
            )
        )


def _format_result(message: str) -> str:
    return f"• {message}"


@frappe.whitelist()
def create_variants(doc: Dict) -> frappe._dict:
    """Create item variants for the rows included in the form."""

    parsed = frappe.parse_json(doc) if not isinstance(doc, dict) else doc
    template_item = parsed.get("template_item")
    if not template_item:
        frappe.throw(_("Select a Template Item before creating variants."))

    rows: List[Dict] = parsed.get("variants") or []
    if not rows:
        frappe.throw(_("Add at least one variant row."))

    context = _get_template_context(template_item)
    allowed_values = [
        value.get("attribute_value")
        for value in context.values
        if value.get("attribute_value")
    ]
    _validate_rows(rows, allowed_values)

    log: List[str] = []
    created: List[str] = []

    for row in rows:
        row_dict = frappe._dict(row)
        attribute_value = row_dict.attribute_value
        args = {context.attribute: attribute_value}

        existing = get_variant(template_item, args)
        if existing:
            log.append(
                _format_result(
                    _("Skipped {0}: variant already exists ({1}).").format(
                        frappe.bold(attribute_value), frappe.bold(existing)
                    )
                )
            )
            continue

        try:
            variant_doc = create_variant(template_item, args)
            if isinstance(variant_doc, str):
                variant_doc = frappe.get_doc("Item", variant_doc)

            # Rename variant if a custom code is provided
            if row_dict.item_code and row_dict.item_code != variant_doc.name:
                rename_doc("Item", variant_doc.name, row_dict.item_code, force=True)
                variant_doc = frappe.get_doc("Item", row_dict.item_code)

            updates = {}
            if row_dict.item_name:
                updates["item_name"] = row_dict.item_name
            if row_dict.variant_sku:
                updates["sku"] = row_dict.variant_sku
            if row_dict.description:
                updates["description"] = row_dict.description

            if updates:
                variant_doc.update(updates)
                variant_doc.flags.ignore_permissions = True
                variant_doc.save()

            created_name = variant_doc.name
            created.append(created_name)
            log.append(
                _format_result(
                    _("Created variant {0} for attribute value {1}.").format(
                        frappe.bold(created_name), frappe.bold(attribute_value)
                    )
                )
            )
        except Exception as exc:  # pragma: no cover - depends on ERPNext runtime
            frappe.log_error(
                title="Variant Creation Tool",
                message=frappe.get_traceback(),
            )
            log.append(
                _format_result(
                    _("Failed to create variant for {0}: {1}").format(
                        frappe.bold(attribute_value), frappe.bold(str(exc))
                    )
                )
            )

    message = "\n".join(log)
    if message:
        frappe.msgprint(message, title=_("Variant Creation Summary"))

    return frappe._dict({"log": message, "created": created})
