const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const Review = require('./review');
const mongoosePaginate = require('mongoose-paginate');

const VinylSchema = new Schema({
	title       : String,
	price       : String,
	description : String,
	images      : [ { url: String, public_id: String } ],
	location    : String,
	geometry    : {
		type        : {
			type     : String,
			enum     : [ 'Point' ],
			required : true
		},
		coordinates : {
			type     : [ Number ],
			required : true
		}
	},
	properties  : {
		description : String
	},
	author      : {
		type : Schema.Types.ObjectId,
		ref  : 'User'
	},
	reviews     : [
		{
			type : Schema.Types.ObjectId,
			ref  : 'Review'
		}
	],
	avgRating   : { type: Number, default: 0 }
});

// delete reviews from the database if the vinyl containing the reviews is deleted
VinylSchema.pre('remove', async function() {
	await Review.remove({
		_id : {
			$in : this.reviews
		}
	});
});

// average rating for the vinyl
VinylSchema.methods.calculateAvgRating = function() {
	let ratingsTotal = 0;
	// if there are reviews
	if (this.reviews.length) {
		this.reviews.forEach((review) => {
			ratingsTotal += review.rating;
		});
		this.avgRating = Math.round(ratingsTotal / this.reviews.length * 10) / 10;
	}
	else {
		// if there are no reviews
		this.avgRating = ratingsTotal;
	}
	const floorRating = Math.floor(this.avgRating);
	this.save(); // snima vinyl u bazu
	return floorRating;
};

VinylSchema.plugin(mongoosePaginate);

VinylSchema.index({ geometry: '2dsphere' });

module.exports = mongoose.model('Vinyl', VinylSchema);
