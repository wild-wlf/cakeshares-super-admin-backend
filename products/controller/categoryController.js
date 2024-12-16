const { CATEGORY } = global;
const { uploadImages, generatePreSignedUrl, filterUserQuery, pagination } = require('../helper');

module.exports = {
  createCategory: async (req, res, next) => {
    const categoryData = req.body;

    if (!categoryData?.name) return res.status(404).json({ succes: false, message: 'Category Name is Required!' });

    const isCategoryExists = await CATEGORY.findOne({ name: categoryData?.name });

    if (isCategoryExists) {
      return res.status(403).json({
        success: false,
        message: `Category with the name '${isCategoryExists?.name}' Already Exists!`,
      });
    }
    if (req.file) {
      try {
        const currentTime = Date.now();
        const { locations } = await uploadImages(req.file, `Category/${currentTime}`);
        categoryData.icon = locations.icon[0];
      } catch (err) {
        console.error(err);
        return res.status(500).json({
          success: false,
          message: 'Error in Uploading Icon!',
        });
      }
    }

    await CATEGORY.create(categoryData);

    return res.status(201).json({
      success: true,
      message: 'Category Created Successfully!',
    });
  },

  getAllCategories: async (req, res) => {
    let { page, itemsPerPage, searchText, getAll } = {
      ...req.query,
      ...filterUserQuery(req),
    };

    const query = {
      $and: [
        {
          $or: [{ name: { $regex: new RegExp(searchText, 'i') } }],
        },
      ],
    };

    const counts = await CATEGORY.aggregate([
      {
        $facet: {
          totalCategories: [{ $match: query }, { $count: 'count' }],
          totalCategoryCount: [{ $count: 'count' }],
        },
      },
    ]);

    const totalCategories = counts[0].totalCategories[0]?.count || 0;
    const totalCategoryCount = counts[0].totalCategoryCount[0]?.count || 0;

    let categories = [];

    if (getAll === 'true') {
      categories = await CATEGORY.find(query).select('_id name bgColor textColor icon').sort({ created_at: 1 }).lean().exec();
    } else {
      categories = await CATEGORY.find(query)
        .lean()
        .sort({ created_at: -1 })
        .skip((page - 1) * itemsPerPage)
        .limit(itemsPerPage)
        .exec();
    }

    return res.status(200).json({
      success: true,
      message: 'Categories Retrieved Successfully!',
      allCategories: totalCategoryCount,
      ...pagination(categories, page, totalCategories, itemsPerPage, getAll),
    });
  },

  updateCategory: async (req, res) => {
    const { id } = req.params;
    const categoryData = req.body;

    const isCategoryExists = await CATEGORY.findOne({
      $and: [{ name: categoryData?.name }, { _id: { $ne: id } }],
    });
    if (isCategoryExists) {
      return res.status(403).json({
        success: false,
        message: `Category with the name '${isCategoryExists?.name}' already exists!`,
      });
    }
    if (req.file) {
      const currentTime = Date.now();
      const { locations } = await uploadImages(req.file, `Category/${currentTime}`);
      categoryData.icon = locations.icon[0];
    }
    await CATEGORY.findByIdAndUpdate(id, categoryData);

    return res.status(200).json({ success: true, message: 'Category Updated Successfully!' });
  },
};
