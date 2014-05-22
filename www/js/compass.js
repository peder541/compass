var map = false;
var me = false;
var drop = false;
var route = false;
var watchID = false;
var cars = {};

var geo = {
	success: function(position) {
		var crds = position.coords;
		draw(0, crds.latitude, crds.longitude, crds.accuracy);
	},
	error: function() {
		alert('Unable to find position');
	},
	options: {
		enableHighAccuracy: true	
	}
};
function draw(index, latitude, longitude, accuracy) {
	var spot = new google.maps.LatLng(latitude, longitude);
	if (!map) {
		var mapOptions = {
			zoom: 14,
			center: spot,
			mapTypeControl: false,
			streetViewControl: false,
			disableDefaultUI: true
		};
		map = new google.maps.Map(document.getElementById('map-canvas'), mapOptions);
	}
	if (!index) {
		if (!me) {
			me = new google.maps.Marker();
			me.setIcon('img/Google Maps Markers/red_MarkerA.png');
			me.setMap(map);
			me.setPosition(map.center);
		}
		var obj = me;
	}
	else {
		if (!cars[index]) {
			cars[index] = new google.maps.Marker();
			cars[index].setIcon('img/Google Maps Markers/black_Marker.png');
		}
		var obj = cars[index];
	}
	if (typeof(accuracy) === 'undefined' || accuracy < 100) {
		obj.setMap(map);
		obj.setPosition(spot);
	}
}

function editPosition(setDrop) {
	if (window.confirmPosition) $('#confirmPosition').click();
	if (watchID !== false) {
		navigator.geolocation.clearWatch(watchID);
		watchID = false;	
	}
	var obj = me;
	if (setDrop) {
		if (!drop) {
			drop = new google.maps.Marker();
			drop.setIcon('img/Google Maps Markers/blue_MarkerB.png');
			drop.setMap(map);
			drop.setPosition(map.center);	
		}
		obj = drop;
	}
	map.panTo(obj.getPosition());
	$('#map-canvas').one('mousedown', function() {
		trueCenterIcon(obj);	
	});
	var listener = google.maps.event.addListener(map, 'center_changed', function() { 
		obj.setPosition(map.center);
	});
	
	confirmPosition = function() {
		$('#map-canvas').off('mousedown');
		google.maps.event.removeListener(listener);
		delete confirmPosition;
		me.setVisible(true);
		if (drop) drop.setVisible(true);
		$('#center_icon').hide();
	}
}

function getRoute(destination) {
	if (!destination && drop) destination = drop.getPosition();
	var directionsRequest = {
		origin: me.getPosition(),
		destination: destination,
		travelMode: 'DRIVING'
	};
	var query = new google.maps.DirectionsService();
	query.route(directionsRequest, drawRoute);
}

function drawRoute(directions) {
	$('#cost > span').html(getCost(directions));
	var renderingOptions = {
		directions: directions,
		map: map,
		suppressMarkers: true
	};
	if (!route) route = new google.maps.DirectionsRenderer(renderingOptions);
	else route.setOptions(renderingOptions);
}

function getCost(directions) {
	var initial_cost = 2.5;
	var distance_cost = 0.0018;
	//var duration_cost = 0.0056;	// experimental
	
	var cost = 0;
	var routes = directions.routes;
	var N = routes.length;
	for (var i=0; i<N; ++i) {
		var legs = routes[i].legs;
		for (var j in legs) {	
			cost += legs[j].distance.value * distance_cost;
			//cost += legs[j].duration.value * duration_cost;
		}
	}
	cost /= N;
	cost += initial_cost;
	return cost;	
}

function initialize() {
	watchID = navigator.geolocation.watchPosition(geo.success, geo.failure, geo.options);
}

google.maps.event.addDomListener(window, 'load', initialize);

$(document).ready(function() {
	$(document).on('click', '#editMyPosition', function(event) {
		editPosition();
		this.className = 'My';
		this.id = 'confirmPosition';
		this.innerHTML = 'Confirm My Position';
	})
	.on('click', '#editDropPosition', function(event) {
		editPosition(1);
		this.className = 'Drop';
		this.id = 'confirmPosition';
		this.innerHTML = 'Confirm Drop Position';
	})
	.on('click', '#confirmPosition', function(event) {
		confirmPosition();
		this.id = 'edit' + this.className + 'Position';
		this.innerHTML = 'Edit ' + this.className + ' Position';
		this.className = '';
	})
	.on('click', '#getRoute', function(event) {
		if (window.confirmPosition) $('#confirmPosition').click();
		getRoute();
	});
	
	$(window).on('resize', function(event) {
		if ($('#center_icon').is(':visible')) trueCenterIcon();
		google.maps.event.trigger(map, 'resize');
	});
});

function trueCenterIcon(obj) {
	var $center = $('#center_icon');
	var $map = $('#map-canvas');
	$center.css({ 
		'top': $map.height()*0.5 - $center.height(),
		'left': $map.width()*0.5 - $center.width()*0.5
	}).show();
	if (obj) {
		$center.attr('src', obj.getIcon());
		obj.setVisible(false);
	}
}