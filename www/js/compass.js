var map = false;
var car = false;
var geo = {
	success: function(position) {
		var crds = position.coords;
		draw(crds.latitude, crds.longitude, crds.accuracy);
		$('body').append(crds.latitude + ' ' + crds.longitude + ' ');
	},
	error: function() {
		alert('Unable to find position');
	}
};
function draw(latitude, longitude, accuracy) {
	var spot = new google.maps.LatLng(latitude, longitude);
	if (!map) {
		var mapOptions = {
			zoom: 14,
			center: spot
		};
		map = new google.maps.Map(document.getElementById('map-canvas'), mapOptions);
	}
	if (!car) car = new google.maps.Marker();
	if (accuracy === false || accuracy < 100) {
		car.setMap(map);
		car.setPosition(spot);
	}
}

function initialize() {
	navigator.geolocation.watchPosition(geo.success, geo.failure, geo.options);	
}
google.maps.event.addDomListener(window, 'load', initialize);