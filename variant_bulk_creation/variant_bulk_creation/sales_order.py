"""Sales Order helpers for Variant Bulk Creation."""

from __future__ import annotations

from typing import Optional

import frappe
from frappe import _

from .doctype.variant_creation_tool.variant_creation_tool import _get_template_context

try:
    from erpnext.controllers.item_variant import create_variant, get_variant
except ImportError as exc:  # pragma: no cover - ERPNext not available during tests
    raise ImportError(
        "Variant Bulk Creation requires ERPNext to resolve Sales Order variants."
    ) from exc


def _materialise_variant(template_item: str, attribute_value: str):
    """Return an Item document for the requested variant, creating it if needed."""

    context = _get_template_context(template_item)
    attribute = context.attribute
    allowed = {
        value.get("attribute_value")
        for value in context.get("values") or []
        if value.get("attribute_value")
    }
    if attribute_value not in allowed:
        frappe.throw(
            _(
                "Attribute value {0} is not defined on template {1}."
            ).format(frappe.bold(attribute_value), frappe.bold(template_item))
        )

    args = {attribute: attribute_value}

    variant_name = get_variant(template_item, args)
    if variant_name:
        return frappe.get_doc("Item", variant_name)

    variant_doc = create_variant(template_item, args)
    if isinstance(variant_doc, str):
        variant_doc = frappe.get_doc("Item", variant_doc)

    if not frappe.db.exists("Item", variant_doc.name):
        variant_doc.flags.ignore_permissions = True
        variant_doc.insert()
        variant_doc.reload()

    return variant_doc


def ensure_sales_order_variants(doc, _event: Optional[str] = None) -> None:
    """Populate Sales Order item codes from template and attribute selections."""

    for row in doc.get("items", []):
        template_item = row.get("template_item")
        attribute_value = row.get("attribute_value")

        if not template_item or not attribute_value:
            continue

        try:
            variant_doc = _materialise_variant(template_item, attribute_value)
        except Exception:
            frappe.log_error(
                title="Variant Bulk Creation - Sales Order",
                message=frappe.get_traceback(),
            )
            frappe.throw(
                _(
                    "Unable to create or locate variant for {0} on template {1}."
                ).format(frappe.bold(attribute_value), frappe.bold(template_item))
            )

        row.item_code = variant_doc.name

        if hasattr(row, "item_name") and variant_doc.get("item_name"):
            row.item_name = variant_doc.item_name
        if hasattr(row, "description") and variant_doc.get("description"):
            row.description = variant_doc.description

        if hasattr(row, "uom") and variant_doc.get("stock_uom"):
            row.uom = variant_doc.stock_uom
            row.stock_uom = variant_doc.stock_uom

        if hasattr(row, "conversion_factor") and not row.get("conversion_factor"):
            row.conversion_factor = 1


@frappe.whitelist()
def get_template_attribute(template_item: str) -> dict[str, str]:
    """Return the variant attribute configured on the given template item."""

    context = _get_template_context(template_item)
    return {"attribute": context.attribute}


@frappe.whitelist()
def resolve_sales_order_variant(template_item: str, attribute_value: str) -> dict[str, Optional[str]]:
    """Return the resolved variant details for client-side population."""

    variant_doc = _materialise_variant(template_item, attribute_value)

    return {
        "item_code": variant_doc.name,
        "item_name": variant_doc.get("item_name"),
        "description": variant_doc.get("description"),
        "stock_uom": variant_doc.get("stock_uom"),
        "conversion_factor": 1,
    }
