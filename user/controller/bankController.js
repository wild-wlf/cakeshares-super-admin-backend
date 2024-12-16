const { stripe_publishable_key, stripe_secrete_key } = require('../config');
const { filterQuery, pagination, userFilter, createNotification, sendSocketNotification, userTypeFilter } = require('../helper');
const { USER, WALLET, TRANSACTION, PAYOUT, ADMIN } = global;
const stripe = require('stripe')(stripe_secrete_key);

module.exports = {
  sendConfigToClient: async (req, res) => {
    res.status(200).json({ code: 200, success: true, publishableKey: stripe_publishable_key });
  },

  createPaymentIntent: async (req, res) => {
    const { amount, payment_method_id, amount_after_comission, save_card_details, cardDetails, card_id } = req.body;

    const user = req.user;

    const description = 'Top up';
    const data = {
      currency: 'USD',
      amount: amount,
      confirm: true,
      description: description,
      customer: user.stripeCustomerId,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
    };

    if (save_card_details) {
      const existingPaymentMethods = await stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: 'card',
      });
      const matchingMethod = existingPaymentMethods.data.find(method => method.card.last4 === cardDetails.last4 && method.card.exp_month === cardDetails.exp_month && method.card.exp_year === cardDetails.exp_year);

      if (matchingMethod) {
        data.payment_method = matchingMethod.id;
      } else {
        const newPaymentMethod = await stripe.paymentMethods.create({
          type: 'card',
          card: {
            token: payment_method_id,
          },
          metadata: {
            last4: cardDetails.last4,
            exp_month: cardDetails.exp_month,
            exp_year: cardDetails.exp_year,
          },
        });

        const attachedPaymentMethod = await stripe.paymentMethods.attach(newPaymentMethod.id, {
          customer: user.stripeCustomerId,
        });

        data.payment_method = attachedPaymentMethod.id;
      }
    }

    if (card_id) {
      data.payment_method = card_id;
    }

    if (!card_id && !save_card_details) {
      data.payment_method_data = {
        type: 'card',
        card: {
          token: payment_method_id,
        },
      };
    }
    const paymentIntent = await stripe.paymentIntents.create(data);

    if (paymentIntent) {
      const walletUpdated = await WALLET.findOneAndUpdate({ userId: user._id }, { $inc: { totalAmount: amount_after_comission } }, { upsert: true, new: true });

      await TRANSACTION.create({ userId: user._id, walletId: walletUpdated._id, amount: amount_after_comission, transactionType: 'card_topup' });
      if (walletUpdated) {
        const notificationData = {
          actionType: 'topup_successful',
          title: 'Top-Up Successful!',
          message: [`An amount of $${(parseFloat(amount) / 100).toFixed(2)} has been successfully credited to your account balance.`],
        };

        await createNotification([walletUpdated.userId], notificationData, [], {
          buyerNotification: user?.type === 'Buyer' ? true : false,
          sellerNotification: user?.type === 'Seller' ? true : false,
        });
        res.status(200).json({ code: 200, success: true, data: paymentIntent });
      }
    } else {
      res.status(500).json({ code: 500, success: false, status: 'error' });
    }
  },

  addCardToCustomer: async (req, res) => {
    const { payment_method } = req.body;

    const user = req.user;

    const attachedPaymentMethod = await stripe.paymentMethods.attach(payment_method, {
      customer: user.stripeCustomerId,
    });
    res.status(200).json({ code: 200, success: true, attachedPaymentMethod });
  },

  listCustomerCards: async (req, res) => {
    const user = req.user;

    const existingPaymentMethods = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: 'card',
    });

    res.status(200).json({ code: 200, success: true, data: existingPaymentMethods.data.map(_ => ({ id: _.id, last4: _.card.last4, brand: _.card.display_brand })) });
  },

  requestPayout: async (req, res) => {
    const { amountIn, amountEx } = req.body;

    const user = req.user;

    const wallet = await WALLET.findOne({ userId: user._id });

    if (parseFloat(wallet.totalAmount) < parseFloat(amountIn)) {
      return res.status(400).json({ success: false, message: 'Insufficient Funds!.' });
    }

    await PAYOUT.create({ userId: user._id, amountIn: parseFloat(amountIn), amountEx: parseFloat(amountEx), requestDate: new Date() });
    await USER.findByIdAndUpdate(user._id, { $set: { isPayoutRequest: true } });

    const notificationData = {
      actionType: 'product_approved',
      title: `Payout Requested by ${user?.username}`,
      message: [`${user.username} has requested a payout of $${amountIn}.`],
    };

    await createNotification([], notificationData, ['SUPER_ADMIN'], {
      adminNotification: true,
    });

    return res.status(200).json({ success: true, message: 'Payout Requested Successfully.' });
  },

  getAllPayoutRequests: async (req, res) => {
    let { page, itemsPerPage, getAll, searchText, status, userAccType } = {
      ...req.query,
      ...filterQuery(req),
    };

    let filteredUserIds;

    const query = {
      $and: [],
    };

    if (status) {
      query.$and.push({ status });
    }

    if (userAccType) {
      if (userAccType === 'Buyer') {
        filteredUserIds = await userTypeFilter(userAccType, 'type');
      } else {
        filteredUserIds = await userTypeFilter(userAccType, 'sellerType');
      }
      query.$and.push({
        userId: {
          $in: filteredUserIds ?? [],
        },
      });
    }

    searchText = searchText && searchText !== 'undefined' && searchText !== 'null' ? searchText : '';
    query.$and.push({
      $or: [
        {
          userId: {
            $in: (await userFilter(searchText)) ?? [],
          },
        },
      ],
    });

    const totalPayouts = await PAYOUT.countDocuments(query).exec();

    let payouts = [];
    if (getAll === 'true') {
      payouts = await PAYOUT.find(query)
        .lean()
        .populate({
          path: 'userId',
          model: USER,
          select: 'fullName type username _id',
        })
        .sort({ created_at: -1 })
        .exec();
    } else {
      payouts = await PAYOUT.find(query)
        .lean()
        .populate({
          path: 'userId',
          model: USER,
          select: 'fullName type username _id',
        })
        .sort({ created_at: -1 })
        .skip((page - 1) * itemsPerPage)
        .limit(itemsPerPage)
        .exec();
    }

    const allPayoutsInDb = await PAYOUT.countDocuments();

    return res.status(200).json({
      success: true,
      message: 'Payout Requests Retrieved Successfully!',
      allPayoutsInDb,
      ...pagination(payouts, page, totalPayouts, itemsPerPage, getAll),
    });
  },

  handlePayoutRequest: async (req, res) => {
    const { id } = req.params;
    const { status, amountIn } = req.body;

    const findPayoutReq = await PAYOUT.findById(id);

    if (!findPayoutReq) return res.status(404).json({ success: false, message: 'Payout Not Found!' });

    const user = await USER.findById(findPayoutReq?.userId);

    const wallet = await WALLET.findOne({ userId: findPayoutReq?.userId });

    if (parseFloat(wallet.totalAmount) < amountIn) {
      return res.status(400).json({ success: false, message: 'Insufficient Funds!.' });
    }

    // const createNotification = async ({ recipientId, recipientType, actionType, title, message }) => {
    //   await NOTIFICATION.create({
    //     recipientId,
    //     recipientType,
    //     actionType,
    //     title,
    //     message,
    //   });

    //   await sendSocketNotification({ event: `${recipientType}Notification` });
    // };

    if (status === 'approved') {
      await PAYOUT.findByIdAndUpdate(id, { $set: { status: 'approved' } });
      const notificationData = {
        actionType: 'payout_request_approved',
        title: 'Payout Request Approved!',
        message: [`Your payout request for the amount of $${amountIn} has been approved.`],
      };
  
      await createNotification([user._id], notificationData, [], {
        buyerNotification: user?.type === 'Buyer' ? true : false,
        sellerNotification: user?.type === 'Seller' ? true : false,
      });
    } else if (status === 'completed') {
      await PAYOUT.findByIdAndUpdate(id, { $set: { status: 'completed' } });
      await WALLET.findByIdAndUpdate(wallet._id, { $inc: { totalAmount: -amountIn } });
      await TRANSACTION.create({ userId: findPayoutReq.userId, walletId: wallet._id, amount: amountIn, transactionType: 'payout' });
      await USER.findByIdAndUpdate(findPayoutReq.userId, { $set: { isPayoutRequest: false } });
    } else if (status === 'rejected') {
      await PAYOUT.findByIdAndUpdate(id, { $set: { status: 'rejected' } });

      const notificationData = {
        actionType: 'payout_request_rejected',
        title: 'Payout Request Rejected!',
        message: [`Your payout request for the amount of $${amountIn} has been rejected.`],
      };
  
      await createNotification([user._id], notificationData, [], {
        buyerNotification: user?.type === 'Buyer' ? true : false,
        sellerNotification: user?.type === 'Seller' ? true : false,
      });

      await USER.findByIdAndUpdate(findPayoutReq.userId, { $set: { isPayoutRequest: false } });
    }
    return res.status(200).json({ code: 200, success: true, message: `Payout request ${status} successful.` });
  },
};
