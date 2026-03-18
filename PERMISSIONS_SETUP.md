# Item Attribute Value Permissions Setup

## Problem

Non-admin users may see the error: **"You do not have Read or Select Permissions for Item Attribute Value"** when trying to use variant creation features in:
- Sales Order
- Stock Entry
- Stock Reconciliation

## Solution

The app needs read permissions on the "Item Attribute Value" doctype for users to select attributes (Sticker, Powder Code) when creating variants.

### For New Installations

Permissions are automatically set up when the app is installed via the `after_install` hook.

### For Existing Installations

If you installed the app before the permission setup was added, you have two options:

#### Option 1: Run the Permission Setup Script (Recommended)

Execute the following in the Frappe/ERPNext console:

```python
import frappe
from variant_bulk_creation.variant_bulk_creation.setup_permissions import setup_item_attribute_value_permissions

setup_item_attribute_value_permissions()
```

Or run from the command line:

```bash
bench --site [your-site] execute variant_bulk_creation.variant_bulk_creation.setup_permissions.execute
```

#### Option 2: Manual Setup via UI

1. Go to **Setup → Permissions → Item Attribute Value**
2. For each of the following roles, add a permission rule with **Read** enabled:
   - Sales User
   - Sales Manager
   - Stock User
   - Stock Manager
   - Manufacturing User
   - Manufacturing Manager

### Verification

After setup, non-admin users should be able to:
- Select "Variant Template" in item rows
- Choose values from "Sticker Attribute" dropdown
- Choose values from "Powder Code Attribute" dropdown
- Enter "Length (m)" values
- Create variants automatically

### Roles Granted Access

The following roles receive read access to Item Attribute Value:
- **Sales User** & **Sales Manager**: For Sales Order variant creation
- **Stock User** & **Stock Manager**: For Stock Entry and Stock Reconciliation variant creation
- **Manufacturing User** & **Manufacturing Manager**: For Work Order integration

### Notes

- These permissions only grant **read** access to Item Attribute Value
- Users cannot create, modify, or delete Item Attribute Values
- This is required for the Link field queries to work properly in ERPNext
- The permissions are created as Custom DocPerm records to avoid conflicts with standard permissions
