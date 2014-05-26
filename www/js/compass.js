var map = false;
var me = false;
var drop = false;
var route = false;
var watchID = false;
var filemtime = 0;
var cars = {};
var driver = false;

var geo = {
	success: function(position) {
		var crds = position.coords;
		draw(0, crds.latitude, crds.longitude, crds.accuracy);
		connect();
	},
	error: function() {
		alert('Unable to find position');
		draw(0, 44.96104703638518, -93.20329773559574, 10000);
	},
	options: {
		enableHighAccuracy: true,
		timeout: 5000
	}
};
function connect() {
	if (window.io) {
		socket = io.connect('https://okeebo.com:8000');
		socket.on('news', function(data) {
			console.log(data);
		}).on('initialize', function(data) {
			for (var i in cars) cars[i].setMap();
			cars = {};
			for (var id in data) {
				draw(id, data[id][0], data[id][1]);
			}
		}).on('update', function(data) {
			draw(data.id, data.coordinates[0], data.coordinates[1]);
		}).on('leave', function(data) {
			if (cars[data.id]) {
				cars[data.id].setMap();
				delete cars[data.id];
			}
		});
	}
}
function draw(index, latitude, longitude, accuracy) {
	var spot = new google.maps.LatLng(latitude, longitude);
	if (!map) {
		var mapOptions = {
			zoom: 15,
			center: spot,
			mapTypeControl: false,
			streetViewControl: false,
			disableDefaultUI: true
		};
		map = new google.maps.Map(document.getElementById('map-canvas'), mapOptions);
		if (accuracy > 500) {
			var circle = new google.maps.Circle({
				center: spot,
				radius: accuracy,
				map: map,
				visible: false
			});
			map.fitBounds(circle.getBounds());
			circle.setMap();
		}
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
			cars[index].setMap(map);
		}
		var obj = cars[index];
	}
	if (typeof(accuracy) === 'undefined' || accuracy < 120) {
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
		me.setVisible(true);
		if (drop) drop.setVisible(true);
		$('#center_icon').hide();
		delete confirmPosition;
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
		$('#map-canvas').css('height', window.innerHeight - (window.innerWidth < 550 ? 80 : 40));
		google.maps.event.trigger(map, 'resize');
		if ($('#center_icon').is(':visible')) trueCenterIcon();
	});
	
	$(window).resize();
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

function around_the_block(lat, lng) {
	var delta = 0.00001;
	var mph = 25;
	var bounds = {
		north: 45.0357,
		south: 45.0328,
		east: -93.1839,
		west: -93.1876
	};
	
	if (!lat || lat == 0) {
		lat = bounds.south;
		lng = bounds.east;
		google.maps.event.addListener(me, 'position_changed', function() {
			var spot = me.getPosition();
			if (window.io && window.socket) socket.emit('update', [spot.lat(), spot.lng()]);
		});
	} 
	else if (lng >= bounds.east && lat < bounds.north) {
		lat += delta;
	}
	else if (lat >= bounds.north && lng > bounds.west) {
		lng -= delta;
	}	
	else if (lng <= bounds.west && lat > bounds.south) {
		lat -= delta;
	}
	else if (lat <= bounds.south && lng < bounds.east) {
		lng += delta;
	}
	me.setPosition(new google.maps.LatLng(lat,lng));
	driveTimerID = setTimeout(function() { around_the_block(lat,lng); }, 1000 * delta * 3600 / mph * 59);
}

function stop_drive() {
	clearTimeout(driveTimerID);
}