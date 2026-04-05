/**
 * Central services index.
 * Import everything from here:
 *   const { orderService, paymentService } = require('./services');
 */

module.exports = {
  userService:        require('./users/userService'),
  categoryService:    require('./categories/categoryService'),
  supplierService:    require('./suppliers/supplierService'),
  productService:     require('./products/productService'),
  stockService:       require('./stock/stockService'),
  tableService:       require('./tables/tableService'),
  reservationService: require('./reservations/reservationService'),
  discountService:    require('./discounts/discountService'),
  orderService:       require('./orders/orderService'),
  paymentService:     require('./payments/paymentService'),
  returnService:      require('./returns/returnService'),
  shiftService:       require('./shifts/shiftService'),
  reportService:      require('./reports/reportService'),
  auditService:       require('./audit/auditService'),
};
