const express = require('express');
require('express-group-routes');
const multer = require('multer');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const { productController, investmentController, categoryController, productAdvertisementController } = require('../controller');
const { window, max_limit } = require('../config');
const { userAuth, adminAuth, mergeAuth, tryCatch } = require('../middleware');

const limiter = rateLimit({
  windowMs: window * 1000,
  max: max_limit,
  message: `Too many requests to this end-point, please try again after ${window} seconds`,
});

const storage = multer.memoryStorage();
const upload = multer({ storage });

router.group('/v1', router => {
  router.get('/health', (req, res) => {
    res.status(200).send('Product service is OK');
  });
  router.get('/get-all-products-super', [adminAuth], tryCatch(productController.getAllProductsSuper));
  router.post('/create-product', upload.any('images'), [mergeAuth], tryCatch(productController.createProduct));
  router.get('/get-all-products', [userAuth], tryCatch(productController.getAllProducts));
  router.get('/get-ongoing-products', [userAuth], tryCatch(productController.getOngoingProducts));
  router.put('/update-product/:id', upload.any('images'), [mergeAuth], tryCatch(productController.updateProduct));
  router.delete('/delete-product/:id', [mergeAuth], tryCatch(productController.deleteProduct));
  router.put('/reject-product/:id', [mergeAuth], tryCatch(productController.rejectProduct));
  router.get('/get-single-product/:id', tryCatch(productController.getSingleProduct));
  router.get('/get-all-assets', [userAuth], tryCatch(productController.getAllAssets));
  router.get('/search-products', tryCatch(productController.searchProducts));
  router.post('/download-statement', [userAuth], tryCatch(productController.downloadStatement));
  router.get('/best-selling-seller-product', [userAuth], tryCatch(productController.bestSellingSellerProducts));

  // edit product request
  router.get('/product-details/:id', [limiter, adminAuth], tryCatch(productController.getProductFromEditRequest));

  // CATRGORY
  router.post('/create-category', upload.single('icon'), [adminAuth], tryCatch(categoryController.createCategory));
  router.put('/update-category/:id', upload.single('icon'), [adminAuth], tryCatch(categoryController.updateCategory));
  router.get(
    '/get-all-categories',
    //  [limiter],
    tryCatch(categoryController.getAllCategories),
  );

  // INVESTMENT
  router.get('/get-all-investments-super', [adminAuth], tryCatch(investmentController.getAllInvestmentsSuper));
  router.get('/get-dashboard-cards', [adminAuth], tryCatch(investmentController.getDashboardCards));

  // MAIN SITE
  router.get('/products', tryCatch(productController.getAllProductsForHomePage));
  router.patch('/manage-product-edit/:id', [limiter, adminAuth], tryCatch(productController.manageProductEdit));

  // PRODUCT ADVERTISEMENT
  router.post('/advertise-product', [userAuth], tryCatch(productAdvertisementController.advertiseProduct));
});

module.exports = router;
