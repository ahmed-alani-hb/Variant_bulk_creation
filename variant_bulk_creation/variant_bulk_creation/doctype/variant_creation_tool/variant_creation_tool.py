# SPDX-License-Identifier: MIT
"""Server-side logic for the Variant Creation Tool."""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Sequence

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

    @frappe.whitelist()
    def create_variants(self):
        """DocType method invoked from the client button to create variants."""

        result = create_variants(self.as_dict())
        if result:
            self.creation_log = result.get("log") or ""
        return result


@frappe.whitelist()
def fetch_template_details(template_item: str) -> frappe._dict:
    """Return attribute metadata and helper text for the selected template item."""

    context = _get_template_context(template_item)
    allowed_values = context.get("values") or []
    value_labels = ", ".join(
        value.get("attribute_value")
        for value in allowed_values
        if value.get("attribute_value")
    )
    return frappe._dict(
        {
            "attribute": context.attribute,
            "template_name": context.template_name,
            "values": allowed_values,
            "value_labels": value_labels,
        }
    )


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def search_attribute_values(
    doctype: str,
    txt: str,
    searchfield: str,
    start: int,
    page_len: int,
    filters: Optional[Dict] = None,
):
    """Return attribute values for the provided Item Attribute without triggering permission scripts."""

    parsed_filters = frappe.parse_json(filters) if isinstance(filters, str) else filters or {}
    attribute = parsed_filters.get("attribute")

    if not attribute:
        return []

    like_pattern = f"%{txt or ''}%"

    rows = frappe.db.sql(
        """
        select
            attribute_value as name,
            attribute_value,
            abbr
        from `tabItem Attribute Value`
        where parent = %(attribute)s
            and parenttype = 'Item Attribute'
            and (
                %(txt)s = ''
                or attribute_value like %(like)s
                or ifnull(abbr, '') like %(like)s
            )
        order by idx asc
        limit %(start)s, %(page_len)s
        """,
        {
            "attribute": attribute,
            "txt": txt or "",
            "like": like_pattern,
            "start": start,
            "page_len": page_len,
        },
        as_dict=True,
    )

    return [
        [row.attribute_value, row.abbr or row.attribute_value]
        for row in rows
        if row.attribute_value
    ]


def _validate_rows(
    rows: Sequence[Dict], default_template: Optional[str]
) -> Dict[str, frappe._dict]:
    """Ensure every row has a template item and valid attribute value."""

    contexts: Dict[str, frappe._dict] = {}
    missing_template_rows: List[int] = []
    missing_attribute_rows: List[int] = []
    invalid_values: List[tuple[int, str, str]] = []

    for idx, row in enumerate(rows):
        template_item = row.get("template_item") or default_template
        if not template_item:
            missing_template_rows.append(idx + 1)
            continue

        if template_item not in contexts:
            contexts[template_item] = _get_template_context(template_item)

        attribute_value = row.get("attribute_value")
        if not attribute_value:
            missing_attribute_rows.append(idx + 1)
            continue

        allowed_values = contexts[template_item].get("values") or []
        allowed = {
            value.get("attribute_value")
            for value in allowed_values
            if value.get("attribute_value")
        }
        if attribute_value not in allowed:
            invalid_values.append((idx + 1, attribute_value, template_item))

    if missing_template_rows:
        frappe.throw(
            _("Template Item is required in rows: {0}").format(
                ", ".join(map(str, missing_template_rows))
            )
        )

    if missing_attribute_rows:
        frappe.throw(
            _("Attribute Value is required in rows: {0}").format(
                ", ".join(map(str, missing_attribute_rows))
            )
        )

    if invalid_values:
        formatted = ", ".join(
            _("Row {0}: {1} (Template {2})").format(row, value, template)
            for row, value, template in invalid_values
        )
        frappe.throw(
            _("Attribute values outside the template definition were provided: {0}").format(
                formatted
            )
        )

    return contexts


def _format_result(message: str) -> str:
    return f"• {message}"


def _extract_length_from_attribute(attribute_value: str) -> Optional[float]:
    """Extract numeric length value from attribute string (e.g., '6m' -> 6.0)."""
    if not attribute_value:
        return None
    match = re.search(r"(\d+\.?\d*)", str(attribute_value))
    if match:
        try:
            return float(match[1])
        except (ValueError, IndexError):
            return None
    return None


def _detect_sticker_from_attribute(attribute_value: str) -> bool:
    """Detect if the attribute value indicates sticker presence."""
    if not attribute_value:
        return False
    attr_lower = str(attribute_value).lower()
    return 'sticker' in attr_lower and 'no' not in attr_lower


def _calculate_weight_from_template(
    template_item: str,
    attribute_value: str,
) -> Optional[dict]:
    """Calculate weight based on template kg/meter values and variant attributes.

    Args:
        template_item: The template item code
        attribute_value: The attribute value containing length information

    Returns:
        Dictionary with weight_per_unit and weight_uom, or None if calculation not possible
    """
    if not template_item or not attribute_value:
        return None

    # Get template item to read weight configuration
    template = frappe.get_doc("Item", template_item)

    # Extract length from attribute value
    length = _extract_length_from_attribute(attribute_value)
    if not length:
        return None

    # Detect if variant has sticker
    has_sticker = _detect_sticker_from_attribute(attribute_value)

    # Select appropriate kg/meter value
    kg_per_meter = (
        template.get("weight_per_meter_with_sticker") if has_sticker
        else template.get("weight_per_meter_no_sticker")
    )

    if not kg_per_meter:
        return None

    # Calculate pieces per kg (inverse calculation)
    # weight_per_piece = length × kg_per_meter (e.g., 6.5m × 0.5kg/m = 3.25kg/piece)
    # pieces_per_kg = 1 / weight_per_piece (e.g., 1 / 3.25 = 0.308 pcs/kg)
    # Ensure both values are floats (ERPNext may return strings from doc.get())
    try:
        weight_per_piece = float(length) * float(kg_per_meter)
        if weight_per_piece == 0:
            return None
        pieces_per_kg = 1 / weight_per_piece
    except (ValueError, TypeError, ZeroDivisionError):
        return None

    return {
        "weight_per_unit": pieces_per_kg,
        "weight_uom": "pcs"
    }


@frappe.whitelist()
def create_variants(doc: Dict) -> frappe._dict:
    """Create item variants for the rows included in the form."""

    parsed = frappe.parse_json(doc) if not isinstance(doc, dict) else doc
    default_template = parsed.get("template_item")

    rows: List[Dict] = parsed.get("variants") or []
    if not rows:
        frappe.throw(_("Add at least one variant row."))

    contexts = _validate_rows(rows, default_template)

    log: List[str] = []
    created: List[str] = []

    for row in rows:
        row_dict = frappe._dict(row)
        template_item = row_dict.template_item or default_template
        if not template_item:
            # Safety check – validation above should prevent this branch.
            continue

        context = contexts[template_item]
        template_label = context.template_name or template_item
        attribute_value = row_dict.attribute_value
        args = {context.attribute: attribute_value}

        existing = get_variant(template_item, args)
        if existing:
            log.append(
                _format_result(
                    _("Skipped {0} for template {1}: variant already exists ({2}).").format(
                        frappe.bold(attribute_value),
                        frappe.bold(template_label),
                        frappe.bold(existing),
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

            # ``create_variant`` should insert the record, but if a custom app or
            # hook short-circuited the insertion the returned document might not
            # exist yet. Guard against that so the user actually gets the item.
            if not frappe.db.exists("Item", variant_doc.name):
                variant_doc.flags.ignore_permissions = True
                variant_doc.insert()
                variant_doc.reload()

            updates = {}
            if row_dict.item_name:
                updates["item_name"] = row_dict.item_name
            if row_dict.variant_sku:
                updates["sku"] = row_dict.variant_sku
            if row_dict.description:
                updates["description"] = row_dict.description

            # Calculate and set weight if possible
            weight_data = _calculate_weight_from_template(template_item, attribute_value)
            if weight_data:
                updates["weight_per_unit"] = weight_data["weight_per_unit"]
                updates["weight_uom"] = weight_data["weight_uom"]

            if updates:
                variant_doc.update(updates)
                variant_doc.flags.ignore_permissions = True
                variant_doc.save()

            created_name = (
                variant_doc.name
                or variant_doc.get("name")
                or variant_doc.get("item_code")
                or get_variant(template_item, args)
            )

            if not created_name:
                log.append(
                    _format_result(
                        _(
                            "Created variant for {0} on template {1}, but could not determine the new item code."
                        ).format(
                            frappe.bold(attribute_value),
                            frappe.bold(template_label),
                        )
                    )
                )
                continue

            created.append(created_name)
            log.append(
                _format_result(
                    _("Created variant {0} for {1} on template {2}.").format(
                        frappe.bold(created_name),
                        frappe.bold(attribute_value),
                        frappe.bold(template_label),
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
                    _("Failed to create variant for {0} on template {1}: {2}").format(
                        frappe.bold(attribute_value),
                        frappe.bold(template_label),
                        frappe.bold(str(exc)),
                    )
                )
            )

    message = "\n".join(log)
    if message:
        frappe.msgprint(message, title=_("Variant Creation Summary"))

    return frappe._dict({"log": message, "created": created})
