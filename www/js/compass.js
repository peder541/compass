var map = false;
var me = false;
var drop = false;
var route = false;
var watchID = false;
var filemtime = 0;
var cars = {};
var driver = false;
var wait = {
	directions: false,
	geocoding: false
}
var timer = {
	directions: 0,
	geocoding: 0
}
var realtimeRoutesListener = false;

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
		socket = io.connect('http://ridesqirl.com');
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
		}).on('rideRequested', function(data) {
			function drawSpot(endpoint) {
				if (window[endpoint]) window[endpoint].setMap();
				var obj = new google.maps.Marker();
				var spot = new google.maps.LatLng(data[endpoint][0], data[endpoint][1]);
				obj.setIcon('img/Google Maps Markers/' + (endpoint == 'pickup' ? 'blue_MarkerB' : 'green_MarkerC') + '.png');
				obj.setMap(map);
				obj.setPosition(spot);
				window[endpoint] = obj;
			}
			drawSpot('pickup');
			drawSpot('dropoff');
			var destination = dropoff.getPosition();
			var waypoints = [{location: pickup.getPosition()}];
			getRoute(destination, waypoints);
			console.log(data.traffic);
			
			// Realtime routing violates Google's Terms of Service. Link to actual navigation apps instead.
			// "geo://" , "waze://" , "comgooglemaps-x-callback://"
			/*
			if (!realtimeRoutesListener) realtimeRoutesListener = realtimeRoutes(destination, waypoints);
			stopDrive = function() {
				google.maps.event.removeListener(realtimeRoutesListener);
				realtimeRoutesListener = false;
				delete stopDrive;	
			}
			/**/
		}).on('rideOffered', function(data) {
			
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
	if (window.confirmPosition) $('.Confirm').click();
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
	$('#center_icon').attr('src', obj.getIcon());
	$('#map-canvas').one('mousedown', function() {
		trueCenterIcon(obj);	
	});
	var listener = google.maps.event.addListener(map, 'center_changed', function() { 
		obj.setPosition(map.center);
		$('#main-footer input').filter(':visible').val('calculating...');
	});
	var codingListener = google.maps.event.addListener(map, 'idle', function() {
		getAddress(obj);
	});
	getAddress(obj);
	$(setDrop ? '.Drop-off' : '.Pick-up').show().filter('button').hide();
	
	confirmPosition = function(textSearch) {
		$('#map-canvas').off('mousedown');
		google.maps.event.removeListener(listener);
		google.maps.event.removeListener(codingListener);
		me.setVisible(true);
		if (drop) drop.setVisible(true);
		$('#center_icon').hide();
		if (!textSearch) {
			$('#main-footer input').hide();
			$('#main-footer .Confirm').show();
		}
		delete confirmPosition;
	}
}

function getRoute(destination, waypoints, noZoom) {
	var callback = function() {
		getRoute(destination, waypoints, noZoom);
	};
	if (rateLimit.check('directions', callback)) return false;
	
	if (!destination && drop) destination = drop.getPosition();
	var directionsRequest = {
		origin: me.getPosition(),
		destination: destination,
		travelMode: 'DRIVING'
	};
	if (waypoints) directionsRequest.waypoints = waypoints;
	var query = new google.maps.DirectionsService();
	query.route(directionsRequest, function(directions, status) {
		if (status == google.maps.DirectionsStatus.OK) {
			//if (waypoints) transit = directions;
			drawRoute(directions, noZoom);
			
			if (noZoom) giveInstructions(directions);
			else if (waypoints) {
				var riderLeg = directions.routes[0].legs[1];
				if (pickup) pickup.address = riderLeg.start_address.split(',')[0];
				if (dropoff) dropoff.address = riderLeg.end_address.split(',')[0];
			}
		}
		else if (status == google.maps.DirectionsStatus.OVER_QUERY_LIMIT) {
			rateLimit.set('directions');
			return false;
		}
	});
}

function giveInstructions(directions) {
	var $directions = $('#main-footer > #directions').show();
	var legs = directions.routes[0].legs;
	var steps = legs[0].steps;
	var distance = steps[0].distance.value;
	var instructions = steps[distance > 60 || steps.length==1 ? 0 : 1].instructions;
	if (distance < 12 && steps.length==1) {
		instructions = 'You have arrived at <b>';
		if (legs.length > 1) {
			instructions += pickup.address + '</b>';
			instructions += '<div>Your rider should be nearby</div>';
		}
		else instructions += dropoff.address;
	}
	instructions = instructions.replace('Take the 1st','Turn');
	if ($directions.html() != instructions) {
		$directions.html(instructions);
		/*
		var url = 'http://translate.google.com/translate_tts?ie=UTF-8&tl=en&total=1&idx=0&textlen=23&prev=input&q=' + $directions[0].textContent;
		var $speak = $('#speak');
		if ($speak.index() != -1) $speak.attr('src',url);
		else $('body').append('<iframe style="display:none;" id="speak" src="' + url + '"></iframe>');
		/**/
	}
}

function drawRoute(directions, noZoom) {
	$('#cost > span').html(getCost(directions));
	var renderingOptions = {
		directions: directions,
		map: map,
		suppressMarkers: true,
		preserveViewport: !!noZoom/*,
		polylineOptions: {
			strokeColor: 'rgb(0, 94, 255)',				// 'rgb(0, 94, 255)' is the default color Google uses
			strokeOpacity: 0.55,						//	with an opacity of 0.55
			strokeWeight: 6								//	and strokeWidth of 6	
		}/**/
	};
	if (!route) route = new google.maps.DirectionsRenderer(renderingOptions);
	else route.setOptions(renderingOptions);
}

function realtimeRoutes(destination, waypoints) {
	return google.maps.event.addListener(me, 'position_changed', function() {
		getRoute(destination, waypoints, 1);
	});
}


function getCost(directions) {
	//var initial_cost = 2.5;
	var distance_cost = 0.0018;	// $ per meter
	var duration_cost = 0.0056;	// $ per second (experimental)
	
	var cost = 0;
	var routes = directions.routes;
	var N = routes.length;
	for (var i=0; i<N; ++i) {
		var legs = routes[i].legs;
		for (var j in legs) {	
			cost += legs[j].distance.value * distance_cost;
			cost += legs[j].duration.value * duration_cost;
		}
	}
	cost /= N;
	//cost += initial_cost;
	return cost;	
}

function initialize() {
	watchID = navigator.geolocation.watchPosition(geo.success, geo.failure, geo.options);
}

google.maps.event.addDomListener(window, 'load', initialize);

$(document).ready(function() {
	$(document).on('click', '#main-footer .Change', function(event) {
		editPosition($(this).hasClass('Drop-off'));
		this.innerHTML = this.className = this.className.replace('Change','Confirm');
	})
	.on('click', '#main-footer .Confirm', function(event) {
		if (window.confirmPosition) confirmPosition();
		this.className = this.className.replace('Confirm','Change');
		this.innerHTML = this.className;
	})
	.on('click', '#getRoute', function(event) {
		if (window.confirmPosition) $('.Confirm').click();
		getRoute();
		
		if (window.io && window.socket) {
			var data = {
				pickup: me.getPosition(),
				dropoff: drop.getPosition()
			};
			data.pickup = [data.pickup.lat(), data.pickup.lng()];
			data.dropoff = [data.dropoff.lat(), data.dropoff.lng()];
			socket.emit('requestRide', data);
		}
	})
	.on('click', '.collapse', function(event) {
		small_input();
	})
	.on('click', '.clear', function(event) {
		$('#main-footer input').filter(':visible').val('').focus();	
	})
	.on('keydown', function(event) {
		// Esc
		if (event.which == 27) small_input();
		// Arrow Keys
		else if ([37,38,39,40].indexOf(event.which) != -1) {
			delta = Math.pow(1.98,-map.getZoom());
			var center = map.getCenter();
			var lat = center.lat();
			var lng = center.lng();
			if (event.which % 2 == 0) lat += delta * (39 - event.which);
			else lng += delta * (event.which - 38);
			map.setCenter(new google.maps.LatLng(lat,lng));
		}
	});
	
	$('#main-footer input').on('mousedown', function(event) {
		if (fullscreen_input()) {
			event.preventDefault();
			return false;
		}
	}).on('keydown', function(event) {
		var $this = $(this);
		setTimeout(function() {
			var request = {
				bounds: map.getBounds(),
				input: $this.val()
			}
			if (request.input && event.which != 27) {
				autocomplete.getPlacePredictions(request, function(results, status) {
					$('#main-footer ul').remove();
					var $ul = $('<ul>');
					$('#main-footer').append($ul);
					for (var i=0, l=results.length; i<l; ++i) {
						var parts = results[i].description.split(',');
						$ul.append('<li data-ref="' + results[i].reference + '"><span>' + parts.shift() + '</span><br><span>' + parts.join(',') + '</span></li>');
					}
				});
			}
			else $('#main-footer ul').remove();
		}, 10);
	});
	$('#main-footer').on('click', 'li', function(event) {
		if (!window.service) service = new google.maps.places.PlacesService(map);
		var $this = $(this);
		var $input = $('#main-footer input').filter(':visible');
		$input.blur();
		$input.val($this.children('span').eq(0).html());
		var request = {
			reference: $this.attr('data-ref')
		}
		service.getDetails(request, function(results, status) {
			small_input(function() {
				map.panTo(results.geometry.location);
			});
		});
	});
	
	$('.menu').on('click', toggleMenu);
	
	$(window).on('resize', function(event) {
		$('#map-canvas').css('height', window.innerHeight - $('.header').outerHeight() - $('#main-footer').outerHeight());//(window.innerWidth < 550 ? 110 : 70));
		google.maps.event.trigger(map, 'resize');
		if ($('#center_icon').is(':visible')) trueCenterIcon();
	});
	
	$(window).resize();
});

function trueCenterIcon(obj) {
	var $center = $('#center_icon');
	var $map = $('#map-canvas');
	$center.css({ 
		'top': $map.offset().top + $map.height()*0.5 - $center.height(),
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

function toggleMenu() {
	var $sidebar = $('#sidebar');
	var $screen = $('#main');
	if ($sidebar.is(':visible')) {
		$screen.animate({'left':''});
		$sidebar.animate({'left':-$sidebar.width()}, function() { 
			$sidebar.hide();
		});
	}
	else {
		$screen.animate({'left':$sidebar.width()});
		$sidebar.css({'left':-$sidebar.width()}).show().animate({'left':''});
	}
}
function getAddress(obj, retry) {
	if (!window.geocoder) geocoder = new google.maps.Geocoder();
	
	var callback = function() {
		getAddress(obj, retry);
	};
	if (rateLimit.check('geocoding', callback)) return false;
	
	if (!obj) obj = me;
	geocoder.geocode({location: obj.getPosition()}, function(results, status) { 
		if (typeof(timer.geocoding) !== 'undefined') {
			clearTimeout(timer.geocoding);
		}
		if (status == google.maps.GeocoderStatus.OK) {
			var address = results[0].formatted_address;
			address = address.split(',')[0];
			$('#main-footer input').filter(':visible').val(address);
		}
		else if (status == google.maps.GeocoderStatus.OVER_QUERY_LIMIT) {
			rateLimit.set('geocoding');
			if (!retry) timer.geocoding = setTimeout(function() { getAddress(obj, true); }, 2000);
		}
	});	
}
// Uses Postal Address
function codeAddress(address) {
	if (!window.geocoder) geocoder = new google.maps.Geocoder();
	var request = {
		address: address,
		bounds: map.getBounds()
	};
	geocoder.geocode(request, placeCallback);
}
// Accepts Keywords
function findPlace(place) {
	if (!window.service) service = new google.maps.places.PlacesService(map);
	var request = {
		location: map.getCenter(),
		radius: '500',
		query: place
	};
	service.textSearch(request, placeCallback);
}
function placeCallback(results, status) {
	if (status == google.maps.places.PlacesServiceStatus.OK) {
		/*
		for (var i = 0; i < results.length; i++) {
			var address = results[i].formatted_address;
			var LatLng = results[i].geometry.location;
			draw(address, LatLng.lat(), LatLng.lng() );
		}
		/**/
		map.panTo(results[0].geometry.location);
	}
}
function fullscreen_input() {
	var $input = $('#main-footer input').filter(':visible');
	if ($input.offset().top > 12) {
		confirmPosition(1);
		if (!window.autocomplete) {
			autocomplete = new google.maps.places.AutocompleteService();
		}
		$input.css({'height': $input.height()}).animate({'top': '1%', 'left': '2%', 'width': '88%'}, {
			progress: function() {
				$(window).scrollTop(0);
			},
			complete: function() { 
				$input.removeAttr('readonly').select();
				$('.clear,.collapse').show();
			}
		});
		$('#main-footer').animate({'height': '100%'}).children().not($input).hide();
		return true;
	}
}
function small_input(callback) {
	var $input = $('#main-footer input').filter(':visible');
	$input.blur().attr('readonly','readonly');
	$('#main-footer ul').remove();
	$('.clear,.collapse').hide();
	if ($input.offset().top < 12) {
		$input.animate({
			'top': ($input.hasClass('Pick-up') ? '8.33%' : '54.17%'),
			'width': '52%', 
			'left': '5%',
			'height': '45px'
		});
		$('#main-footer').animate({'height': '120px'}, function() {
			$input.css({'top': '', 'left': '', 'width': '', 'height': ''});
			$('.Change' + ($input.hasClass('Drop-off') ? '.Pick-up' : '.Drop-off') + ',#getRoute').show();
			if (typeof(callback) === 'function') callback();
		});
		editPosition($input.hasClass('Drop-off'));
		return true;
	}
}

var rateLimit = {
	check: function(serviceType, callback) {
		if (wait[serviceType]) {
			if (timer[serviceType]) clearTimeout(timer[serviceType]);
			timer[serviceType] = setTimeout(callback, 1000);
			return true;
		}
		else {
			this.set(serviceType, 1000);	
		}
	},
	set: function(serviceType, time) {
		if (!time) time = 2000;
		wait[serviceType] = true;
		if (!rateLimit.timer[serviceType]) {
			var callback = function() { 
				wait[serviceType] = false;
				rateLimit.timer[serviceType] = 0;
			}
			rateLimit.timer[serviceType] = setTimeout(callback, time);
		}
	},
	timer: {
		directions: 0,
		geocoding: 0	
	}
}