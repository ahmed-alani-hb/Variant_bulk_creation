# SPDX-License-Identifier: MIT

import frappe
from frappe.model.document import Document


class VariantCreationRow(Document):
    """Child table row used when preparing item variants."""

    def validate(self):
        """Ensure the attribute value is provided."""
        if not self.attribute_value:
            frappe.throw(frappe._("Attribute Value is required."))
