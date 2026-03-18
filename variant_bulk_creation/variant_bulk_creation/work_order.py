"""Work Order helpers for populating total_pcs in Stock Entry and from Sales Order."""

from __future__ import annotations

from typing import Optional

import frappe


def populate_total_pcs_from_sales_order(doc, _event: Optional[str] = None) -> None:
    """Populate total_pcs in Work Order from Sales Order.

    This function is called when a Work Order is created from a Sales Order.
    It copies the total_pcs (total_weight) value from Sales Order Item to Work Order.
    """

    # Only process Work Order documents that have a sales_order reference
    if doc.doctype != "Work Order" or not doc.get("sales_order"):
        return

    sales_order_name = doc.get("sales_order")

    # Get the Sales Order document
    try:
        sales_order = frappe.get_doc("Sales Order", sales_order_name)
    except Exception:
        # Sales Order might not exist or be accessible
        return

    # Find matching item in Sales Order
    for so_item in sales_order.get("items", []):
        if so_item.item_code == doc.production_item and so_item.get("total_weight"):
            # total_weight in Sales Order corresponds to total pieces
            doc.total_pcs = so_item.total_weight
            break


def populate_total_pcs_in_stock_entry(doc, _event: Optional[str] = None) -> None:
    """Populate total_pcs in Stock Entry Detail from Work Order Item.

    This function is called before a Stock Entry is saved when it's generated
    from a Work Order. It copies the total_pcs value from Work Order Item to
    the corresponding Stock Entry Detail.
    """

    # Only process Stock Entry documents that have a work_order reference
    if doc.doctype != "Stock Entry" or not doc.get("work_order"):
        return

    work_order_name = doc.get("work_order")

    # Get the Work Order document
    try:
        work_order = frappe.get_doc("Work Order", work_order_name)
    except Exception:
        # Work Order might not exist or be accessible
        return

    # Create a mapping of item_code to total_pcs from Work Order
    wo_item_pcs_map = {}

    # Get total_pcs from the required items (finished goods)
    for item_row in work_order.get("required_items", []):
        if item_row.get("total_pcs"):
            wo_item_pcs_map[item_row.item_code] = item_row.total_pcs

    # Also check the production item (finished good)
    if work_order.get("total_pcs"):
        wo_item_pcs_map[work_order.production_item] = work_order.total_pcs

    # Copy total_pcs to Stock Entry Detail rows
    for se_item in doc.get("items", []):
        item_code = se_item.item_code
        if item_code in wo_item_pcs_map and not se_item.get("total_pcs"):
            se_item.total_pcs = wo_item_pcs_map[item_code]
