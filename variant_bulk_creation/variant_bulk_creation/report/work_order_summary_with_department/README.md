# Work Order Summary with Department

This report provides a comprehensive summary of Work Orders with department tracking and piece-level production metrics.

## Features

- Department-based filtering and tracking
- Total pieces (total_pcs) alongside standard quantity tracking
- Production variance calculation (both qty and pieces)
- Comparison of planned vs actual dates
- Links to BOM and Sales Order

## Filters

- **Company** (required): Filter by company
- **From Date** (required): Start date for planned start date range
- **To Date** (required): End date for planned start date range
- **Department** (optional): Filter by specific department
- **Status** (optional): Filter by Work Order status
- **Production Item** (optional): Filter by specific production item

## Columns

- Work Order
- Department
- Status
- Production Item
- Item Name
- Qty to Manufacture
- Total Pieces to Manufacture
- Manufactured Qty
- Total Pieces Produced
- Qty Variance (Qty to Manufacture - Manufactured Qty)
- Pcs Variance (Total Pcs - Total Pcs Produced)
- Planned Start Date
- Planned End Date
- Actual Start Date
- Actual End Date
- BOM
- Sales Order

## Use Cases

1. **Department Performance**: Track production efficiency by department
2. **Production Variance**: Identify discrepancies between planned and actual production
3. **Piece-Level Tracking**: Monitor production at the piece level for better accuracy
4. **Planning Analysis**: Compare planned vs actual timelines
