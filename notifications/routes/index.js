const express = require('express');
require('express-group-routes');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const { notificationController, reportController } = require('../controller');
const { window, max_limit } = require('../config');
const { mergeAuth, userAuth, tryCatch, adminAuth } = require('../middleware');

const limiter = rateLimit({
  windowMs: window * 1000,
  max: max_limit,
  message: `Too many requests to this end-point, please try again after ${window} seconds`,
});

router.get('/health', (req, res) => {
  res.status(200).send('OK');
});

router.group('/v1', router => {
  router.get('/health', (req, res) => {
    res.status(200).send('Notification service is OK');
  });

  router.post('/notification', [mergeAuth], tryCatch(notificationController.createNotification));
  router.get('/read-all-notification', [mergeAuth], tryCatch(notificationController.readAllNotification));
  router.get('/notification', [mergeAuth], tryCatch(notificationController.getAllNotifications));
  router.post('/send-socket-notification', tryCatch(notificationController.sendSocketNotification));

  // direct chat routes
  router.get('/get-all-conversations', mergeAuth, tryCatch(notificationController.getAllConversations));
  router.get('/get-unread-count', mergeAuth, tryCatch(notificationController.getUnreadMessagesCount));
  router.get('/get-conversation-messages', [mergeAuth], tryCatch(notificationController.getConversationMessages));

  // community chat routes
  router.get('/get-com-conversation-messages', [mergeAuth], tryCatch(notificationController.getCommunityConversationMessages));
  router.get('/get-reaction-detail', [mergeAuth], tryCatch(notificationController.getMessageReactions));

  // message reporting
  router.post('/report-message', [mergeAuth], tryCatch(reportController.reportMessage));
  router.get('/get-all-report-messages', [adminAuth], tryCatch(reportController.getAllReportedMessages));
  router.get('/get-all-messages', [mergeAuth], tryCatch(reportController.getAllMessages));
  router.delete('/delete-message/:id', [mergeAuth], tryCatch(reportController.deleteMessage));
  router.put('/block-user/:id', [mergeAuth], tryCatch(reportController.blockUser));
  router.post('/unblock-request', [limiter, mergeAuth], tryCatch(reportController.requestMessage));
});

module.exports = router;
