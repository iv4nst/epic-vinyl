const Vinyl = require('../models/vinyl');
const Review = require('../models/review');

module.exports = {
	// Reviews Create
	async reviewCreate(req, res, next) {
		// find the vinyl by its id and populate reviews
		let vinyl = await Vinyl.findById(req.params.id).populate('reviews').exec();
		// filter vinyl.reviews to see if any of the reviews were created by logged in user
		// .filter() returns a new array, so use .length to see if array is empty or not
		let haveReviewed = vinyl.reviews.filter((review) => {
			return review.author.equals(req.user._id);
		}).length;
		// check if haveReviewed is 0 (false) or 1 (true)
		if (haveReviewed) {
			// flash an error and redirect back to vinyl
			req.session.error = 'Sorry, you can only create one review per vinyl.';
			return res.redirect(`/vinyls/${vinyl.id}`);
		}
		// create the review
		req.body.review.author = req.user._id;
		let review = await Review.create(req.body.review);
		// assign review to vinyl
		vinyl.reviews.push(review);
		// save the vinyl
		vinyl.save();
		// redirect to the vinyl
		req.session.success = 'Review created successfully!';
		res.redirect(`/vinyls/${vinyl.id}`);
	},
	// Reviews Update
	async reviewUpdate(req, res, next) {
		await Review.findByIdAndUpdate(req.params.review_id, req.body.review);
		req.session.success = 'Review updated successfully!';
		res.redirect(`/vinyls/${req.params.id}`);
	},
	// Reviews Destroy
	async reviewDestroy(req, res, next) {
		await Vinyl.findByIdAndUpdate(req.params.id, {
			$pull : { reviews: req.params.review_id }
		});
		await Review.findByIdAndRemove(req.params.review_id);
		req.session.success = 'Review deleted successfully!';
		res.redirect(`/vinyls/${req.params.id}`);
	}
};
