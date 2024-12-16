const express = require('express');
require('express-group-routes');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const multer = require('multer');

const { userController, walletController, kycController, bankController } = require('../controller/index');
const { window, max_limit } = require('../config');
const { userAuth, adminAuth, tryCatch } = require('../middleware');
const transactionController = require('../controller/transactionController');

const limiter = rateLimit({
  windowMs: window * 1000,
  max: max_limit,
  message: `Too many requests to this end-point, please try again after ${window} seconds`,
});

const storage = multer.memoryStorage();
const upload = multer({ storage });

router.group('/v1', router => {
  router.get('/health', (req, res) => {
    res.status(200).send('User service is OK');
  });
  router.post('/registration', upload.single('profilePicture'), tryCatch(userController.registration));
  router.put('/update-user/:id', upload.single('profilePicture'), [adminAuth], tryCatch(userController.updateUser));
  router.patch('/update-password/:id', [userAuth], tryCatch(userController.updatePassword));
  router.post('/login', tryCatch(userController.login));
  router.post('/google-login', tryCatch(userController.googleLogin));
  router.delete('/logout', [userAuth], tryCatch(userController.logout));
  router.get('/me', [userAuth], tryCatch(userController.me));
  router.delete('/delete-inheritance/:id', [userAuth], tryCatch(userController.deleteInheritance));
  router.delete('/delete-user/:id', [adminAuth], tryCatch(userController.deleteUser));
  router.delete('/deactivate-user-accunt/:id', [userAuth], tryCatch(userController.deactivateUserAccount));
  router.post('/create-bank/:id', [userAuth], tryCatch(userController.createBank));

  router.get('/get-all-users', [adminAuth], tryCatch(userController.getAllUsers));
  router.get('/get-single-user/:id', tryCatch(userController.getSingleUser));
  router.put(['/update-chunk-info/:id?', '/update-chunk-info'], upload.fields([{ name: 'profilePicture' }, { name: 'bannerImage' }]), [userAuth], tryCatch(userController.updateChunkInfo));
  router.put(['/update-bank-info/:id'], [userAuth], tryCatch(userController.updateBankDetails));

  // WALLET
  router.post('/add-balance', upload.single('paymentProofDocument'), [adminAuth], tryCatch(walletController.addBalance));
  router.post('/approve-balance', [adminAuth], tryCatch(walletController.approveAddWalletPayment));
  router.post('/initiate-investment', [userAuth], tryCatch(walletController.initiateInvestment));
  router.get('/get-all-transactions', [userAuth], tryCatch(transactionController.getTransactions));
  router.get('/get-wallet-details', [userAuth], tryCatch(walletController.getWalletDetails));

  // KYC
  router.post('/request-kyc', upload.fields([{ name: 'passportImageFront' }, { name: 'passportImageBack' }, { name: 'residenceProofImage' }, { name: 'personalImage' }, { name: 'companyDocumentImage' }]), [userAuth], tryCatch(kycController.requestKyc));
  router.post('/approve-kyc/:id', [adminAuth], tryCatch(kycController.approveKyc));
  router.post('/decline-kyc/:id', [adminAuth], tryCatch(kycController.declineKyc));
  router.get('/get-kyc-info/:id', [adminAuth], tryCatch(kycController.getKycInfo));
});

router.group('/payment/v1', router => {
  router.get('/stripe-config', [userAuth], tryCatch(bankController.sendConfigToClient));
  router.post('/create-payment-intent', [userAuth], tryCatch(bankController.createPaymentIntent));
  router.post('/attach-card', [userAuth], tryCatch(bankController.addCardToCustomer));
  router.get('/list-cards', [userAuth], tryCatch(bankController.listCustomerCards));

  // manual Payout
  router.post('/request-payout', [userAuth], tryCatch(bankController.requestPayout));
  router.get('/get-all-payouts', [adminAuth], tryCatch(bankController.getAllPayoutRequests));
  router.patch('/handle-payout-request/:id', [adminAuth], tryCatch(bankController.handlePayoutRequest));
});

module.exports = router;
