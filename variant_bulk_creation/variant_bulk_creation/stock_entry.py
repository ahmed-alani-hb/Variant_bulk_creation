"""Stock Entry helpers for populating total_pcs in Stock Ledger Entry."""

from __future__ import annotations

from typing import Optional

import frappe


def populate_total_pcs_in_stock_ledger(doc, _event: Optional[str] = None) -> None:
    """Populate total_pcs in Stock Ledger Entry from Stock Entry Detail.

    This function is called when a Stock Entry is submitted and Stock Ledger Entries
    are created. It copies the total_pcs value from Stock Entry Detail to the
    corresponding Stock Ledger Entry.
    """

    # Only process Stock Entry documents
    if doc.doctype != "Stock Entry":
        return

    # Get all Stock Entry Detail rows
    for item_row in doc.get("items", []):
        total_pcs = item_row.get("total_pcs")

        # Skip if no total_pcs value
        if not total_pcs:
            continue

        # Find corresponding Stock Ledger Entries for this item
        # Stock Ledger Entries are created with voucher_type="Stock Entry" and voucher_no=doc.name
        sle_list = frappe.get_all(
            "Stock Ledger Entry",
            filters={
                "voucher_type": "Stock Entry",
                "voucher_no": doc.name,
                "item_code": item_row.item_code,
                "voucher_detail_no": item_row.name,
            },
            pluck="name"
        )

        # Update each Stock Ledger Entry with total_pcs
        for sle_name in sle_list:
            frappe.db.set_value("Stock Ledger Entry", sle_name, "total_pcs", total_pcs, update_modified=False)
