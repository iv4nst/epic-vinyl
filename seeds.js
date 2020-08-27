const faker = require('faker');
const Vinyl = require('./models/vinyl');
const cities = require('./cities');

async function seedVinyls() {
	await Vinyl.deleteMany({});
	for(const i of new Array(600)) {
		const random1000 = Math.floor(Math.random() * 1000);
		const random5 = Math.floor(Math.random() * 6);
		const title = faker.lorem.word();
		const description = faker.lorem.text();
		const vinylData = {
			title,
			description,
			location: `${cities[random1000].city}, ${cities[random1000].state}`,
			geometry: {
				type: 'Point',
				coordinates: [cities[random1000].longitude, cities[random1000].latitude],
			},
			price: random1000,
			avgRating: random5,
			author: '5bb27cd1f986d278582aa58c',
			images: [
				{
					url: 'https://res.cloudinary.com/devsprout/image/upload/v1561315599/surf-shop/surfboard.jpg'
				}
			]
		}
		let vinyl = new Vinyl(vinylData);
		vinyl.properties.description = `<strong><a href="/vinyls/${vinyl._id}">${title}</a></strong><p>${vinyl.location}</p><p>${description.substring(0, 20)}...</p>`;
		vinyl.save();
	}
	console.log('600 new vinyls created');
}

module.exports = seedVinyls;