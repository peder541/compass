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
	if (typeof(accuracy) === 'undefined' || accuracy < 100) {
		car.setMap(map);
		car.setPosition(spot);
	}
}

function initialize() {
	draw(45.0329968, -93.1837094);
	//navigator.geolocation.watchPosition(geo.success, geo.failure, geo.options);
}

$(document).ready(function() {
	google.maps.event.addDomListener(window, 'load', initialize);
});