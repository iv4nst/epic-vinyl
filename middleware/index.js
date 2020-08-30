const Review = require('../models/review');
const User = require('../models/user');
const Vinyl = require('../models/vinyl');
const { cloudinary } = require('../cloudinary');
const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');
const mapBoxToken = process.env.MAPBOX_TOKEN;
const geocodingClient = mbxGeocoding({ accessToken: mapBoxToken });

function escapeRegExp(string) {
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

const middleware = {
	asyncErrorHandler    : (fn) => (req, res, next) => {
		Promise.resolve(fn(req, res, next)).catch(next);
	},

	isReviewAuthor       : async (req, res, next) => {
		let review = await Review.findById(req.params.review_id);
		if (review.author.equals(req.user._id)) {
			return next(); // ne mora da se koristi else ako se stavi return
		}
		// u suprotnom:
		req.session.error = 'Bye bye';
		return res.redirect('/');
	},

	isLoggedIn           : (req, res, next) => {
		if (req.isAuthenticated()) return next();
		req.session.error = 'You need to be logged in to do that!';
		req.session.redirectTo = req.originalUrl; // npr. odemo na vinyls/new i moramo da se ulogujemo, nakon logovanja ostajemo na vinyls/new
		res.redirect('/login');
	},

	isAuthor             : async (req, res, next) => {
		// find a vinyl by id
		const vinyl = await Vinyl.findById(req.params.id);
		// check if the id of the auther is equal to the currently logged in user
		if (vinyl.author.equals(req.user._id)) {
			// if it is, pass the vinyl that we found on to the next middleware function
			res.locals.vinyl = vinyl; // salje se ne samo sledecoj funkciji, vec i view-u koji se renderuje (vinyls/edit, update, destroy) - bice dostupan kao lokalna promenljiva
			return next();
		}
		// if not create a flash error message and redirect the user back to the previous page
		req.session.error = 'Access denied!';
		res.redirect('back');
	},

	isValidPassword      : async (req, res, next) => {
		const { user } = await User.authenticate()(req.user.username, req.body.currentPassword);
		
		if (user) {
			// add user to res.locals
			res.locals.user = user;
			// go to next middleware
			next();
		}
		else {
			// this runs if the current password from the form is not a valid password
			// delete the profile picture if it was uploaded
			middleware.deleteProfileImage(req); // moze ovako jer je const middleware i na dnu module.exports = middleware
			// flash an error
			req.session.error = 'Incorrect current password!';
			return res.redirect('/profile');
		}
	},

	// the user cannot set the new password unless the new password and the confirmation password match
	changePassword       : async (req, res, next) => {
		// destructure new password values from req.body object
		const { newPassword, passwordConfirmation } = req.body;

		if (newPassword && !passwordConfirmation) {
			// delete the profile picture if it was uploaded
			middleware.deleteProfileImage(req);
			req.session.error = 'Missing password confirmation!';
			return res.redirect('/profile');
		}
		else if (newPassword && passwordConfirmation) {
			// if the user entered a new password and a confirmation password (it means he is trying to change the password)
			// destructure user from res.locals
			const { user } = res.locals;
			// check if the new password matches confirmation password
			if (newPassword === passwordConfirmation) {
				// set new password on user object
				await user.setPassword(newPassword);
				// go to next middleware
				next();
			}
			else {
				// delete the profile picture if it was uploaded
				middleware.deleteProfileImage(req);
				// if new password does not match password confirmation
				// flash error
				req.session.error = 'New passwords must match!';
				// short circuit the route middleware and redirect to /profile
				return res.redirect('/profile');
			}
		}
		else {
			// if he didn't enter, he's not trying to change the password,
			// move on to the next function in the middleware chain (potentially update username, email...)
			next();
		}
	},

	// delete profile image
	deleteProfileImage   : async (req) => {
		// if the image exists (if the user uploads it)
		if (req.file) await cloudinary.v2.uploader.destroy(req.file.public_id);
	},

	// create a async middleware method named searchAndFilterVinyls
	async searchAndFilterVinyls(req, res, next) {
		// pull keys from req.query (if there are any) and assign them
		// to queryKeys variable as an array of string values
		const queryKeys = Object.keys(req.query);
		/* 
			check if queryKeys array has any values in it
			if true then we know that req.query has properties
			which means the user:
			a) clicked a paginate button (page number)
			b) submitted the search/filter form
			c) both a and b
		*/
		if (queryKeys.length) {
			// initialize an empty array to store our db queries (objects) in
			const dbQueries = [];
			// destructure all potential properties from req.query
			let { search, price, avgRating, location, distance } = req.query;
			// check if search exists, if it does then we know that the user
			// submitted the search/filter form with a search query
			if (search) {
				// convert search to a regular expression and
				// escape any special characters
				search = new RegExp(escapeRegExp(search), 'gi');
				// create a db query object and push it into the dbQueries array
				// now the database will know to search the title, description, and location
				// fields, using the search regular expression
				dbQueries.push({
					$or : [ { title: search }, { description: search }, { location: search } ]
				});
			}

			// check if location exists, if it does then we know that the user
			// submitted the search/filter form with a location query
			if (location) {
				let coordinates;
				try {
					if (typeof JSON.parse(location) === 'number') {
						throw new Error();
					}
					location = JSON.parse(location);
					coordinates = location;
				} catch (err) {
					const response = await geocodingClient
						.forwardGeocode({
							query : location,
							limit : 1
						})
						.send();
					coordinates = response.body.features[0].geometry.coordinates;
				}
				// get the max distance or set it to 25 mi
				let maxDistance = distance || 25;
				// we need to convert the distance to meters, one mile is approximately 1609.34 meters
				maxDistance *= 1609.34;
				// create a db query object for proximity searching via location (geometry)
				// and push it into the dbQueries array
				dbQueries.push({
					geometry : {
						$near : {
							$geometry    : {
								type        : 'Point',
								coordinates
							},
							$maxDistance : maxDistance
						}
					}
				});
			}
			// check if price exists, if it does then we know that the user
			// submitted the search/filter form with a price query (min, max, or both)
			if (price) {
				/*
				check individual min/max values and create a db query object for each
				then push the object into the dbQueries array
				min will search for all vinyl documents with price
				greater than or equal to ($gte) the min value
				max will search for all vinyl documents with price
				less than or equal to ($lte) the min value
				*/
				if (price.min) dbQueries.push({ price: { $gte: price.min } });
				if (price.max) dbQueries.push({ price: { $lte: price.max } });
			}

			// check if avgRating exists, if it does then we know that the user
			// submitted the search/filter form with a avgRating query (0 - 5 stars)
			if (avgRating) {
				dbQueries.push({ avgRating: { $in: avgRating } });
			}

			// pass database query to next middleware in route's middleware chain
			// which is the vinylIndex method from /controllers/vinylsController.js
			res.locals.dbQuery = dbQueries.length ? { $and: dbQueries } : {};
		}

		// pass req.query to the view as a local variable to be used in the searchAndFilter.ejs partial
		// this allows us to maintain the state of the searchAndFilter form
		res.locals.query = req.query;

		// build the paginateUrl for paginateVinyls partial
		// first remove 'page' string value from queryKeys array, if it exists
		queryKeys.splice(queryKeys.indexOf('page'), 1);
		/*
		now check if queryKeys has any other values, if it does then we know the user submitted the search/filter form
		if it doesn't then they are on /vinyls or a specific page from /vinyls, e.g., /vinyls?page=2
		we assign the delimiter based on whether or not the user submitted the search/filter form
		e.g., if they submitted the search/filter form then we want page=N to come at the end of the query string
		e.g., /vinyls?search=surfboard&page=N
		but if they didn't submit the search/filter form then we want it to be the first (and only) value in the query string,
		which would mean it needs a ? delimiter/prefix
		e.g., /vinyls?page=N
		*N represents a whole number greater than 0, e.g., 1
		*/
		const delimiter = queryKeys.length ? '&' : '?';
		// build the paginateUrl local variable to be used in the paginateVinyls.ejs partial
		// do this by taking the originalUrl and replacing any match of ?page=N or &page=N with an empty string
		// then append the proper delimiter and page= to the end
		// the actual page number gets assigned in the paginateVinyls.ejs partial
		res.locals.paginateUrl = req.originalUrl.replace(/(\?|\&)page=\d+/g, '') + `${delimiter}page=`;
		// move to the next middleware (vinylIndex method)
		next();
	}
};

module.exports = middleware;
