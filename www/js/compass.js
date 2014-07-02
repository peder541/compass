var mobile = 0;
var mobile_timer;
var map = false;
var me = false;
var drop = false;
var route = false;
var watchID = false;
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
var drivingListener = false;


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
	if (window.io && !window.socket) {
		socket = io.connect('https://ridesqirl.com');
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
				var markerOptions = {
					clickable: false,
					map: map,
					icon: 'img/Google Maps Markers/' + (endpoint == 'pickup' ? 'blue_MarkerB' : 'green_MarkerC') + '.png',
					optimized: false,
					position: new google.maps.LatLng(data[endpoint][0], data[endpoint][1])
				};
				var obj = new google.maps.Marker(markerOptions);
				window[endpoint] = obj;
			}
			drawSpot('pickup');
			drawSpot('dropoff');
			var destination = dropoff.getPosition();
			var waypoints = [{location: pickup.getPosition()}];
			getRoute(destination, waypoints, 0, data.traffic);
			
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
			var markerOptions = {
				clickable: false,
				map: map,
				icon: 'img/Google Maps Markers/red_MarkerA.png',
				optimized: false,
				position: map.center
			};
			me = new google.maps.Marker(markerOptions);
		}
		var obj = me;
	}
	else {
		if (!cars[index]) {
			var markerOptions = {
				clickable: false,
				map: map,
				icon: 'img/Google Maps Markers/black_Marker.png',
				optimized: false,
				position: map.center
			};
			cars[index] = new google.maps.Marker(markerOptions);
		}
		var obj = cars[index];
	}
	if (typeof(accuracy) === 'undefined' || accuracy < 120) {
		obj.setPosition(spot);
	}
}

function editPosition(setDrop) {
	if (window.confirmPosition) confirmPosition();
	if (watchID !== false) {
		navigator.geolocation.clearWatch(watchID);
		watchID = false;	
	}
	var obj = me;
	if (setDrop) {
		if (!drop) {
			var markerOptions = {
				clickable: false,
				map: map,
				icon: 'img/Google Maps Markers/blue_MarkerB.png',
				optimized: false,
				position: map.center
			};
			drop = new google.maps.Marker(markerOptions);
			$('.Change.Drop-off').html('Change Drop-off');
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
	var $elements = $(setDrop ? '.Drop-off' : '.Pick-up');
	var $input = $elements.filter('input').show();
	var $button = $elements.filter('button').hide();
	
	confirmPosition = function(textSearch) {
		$('#map-canvas').off('mousedown');
		google.maps.event.removeListener(listener);
		google.maps.event.removeListener(codingListener);
		me.setVisible(true);
		if (drop) drop.setVisible(true);
		$('#center_icon').hide();
		if (!textSearch) {
			$input.hide();
			$button.show();
		}
		delete confirmPosition;
	}
} 

function getRoute(destination, waypoints, noZoom, traffic) {
	var callback = function() {
		getRoute(destination, waypoints, noZoom, traffic);
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
			drawRoute(directions, noZoom, traffic);
			$('#cost > span').html(getCost(directions, traffic));
			
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

function drawRoute(directions, noZoom, traffic) {
	if (!noZoom) midPoints(directions, traffic);
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


function getCost(directions, traffic) {
	//var initial_cost = 2.5;
	var distance_cost = 0.0018;	// $ per meter
	var duration_cost = 0.0056;	// $ per second (experimental)
	
	traffic = traffic || 1;
	var cost = 0;
	var routes = directions.routes;
	var N = routes.length;
	for (var i=0; i<N; ++i) {
		var legs = routes[i].legs;
		var l = legs.length;
		var j = (l > 1) ? 1 : 0;
		for (j; j < l; ++j) {	
			cost += legs[j].distance.value * distance_cost;
			cost += legs[j].duration.value * duration_cost * traffic;
		}
	}
	cost /= N;
	//cost += initial_cost;
	return cost;	
}

function midPoints(directions, traffic) {
	var legs = directions.routes[0].legs;
	if (legs.length == 1) return false;
	traffic = traffic || 1;
	if (window.info) for (var i=0, l=info.length; i<l; ++i) info[i].setMap();
	info = [];
	for (var i=0, l=legs.length; i<l; ++i) {
		var midpoint = legs[i].distance.value*0.5;
		var time = legs[i].duration.value;
		var traveled = 0;
		var steps = legs[i].steps;
		for (var j=0, m=steps.length; j<m; ++j) {
			traveled += steps[j].distance.value;
			if (midpoint < traveled) {
				var delta = steps[j].distance.value - traveled + midpoint;
				var ratio = delta/steps[j].distance.value;
				var index = Math.floor(steps[j].lat_lngs.length * ratio);
				function markPoint(position, time, legTraffic) {
					var markerOptions = {
						map: map,
						position: position,
						icon: 'http://ridesqirl.com/svg?text=' + Math.ceil(time/60 * legTraffic)
					};
					return new google.maps.Marker(markerOptions);
				}
				if (i==0) {
					var from = legs[0].start_location;
					var to = legs[0].end_location
					var data = {
						pickup: [from.lat(), from.lng()], 
						dropoff: [to.lat(), to.lng()]
					};
					var spot = steps[j].lat_lngs[index];
					var t = time;
					socket.once('trafficResponse', function(traffic) {
						info[0] = markPoint(spot, t, traffic); 
					}).emit('trafficRequest', data);
				}
				else info[i] = markPoint(steps[j].lat_lngs[index], time, traffic);
				break;
			}
		}
	}
	var noCities = [ { "featureType": "administrative", "elementType": "labels", "stylers": [ { "visibility": "off" } ] } ];
	var normalStyle = [ { } ];
}

function makePayment() {
	$('body').append('<iframe src="pay.html" id="pay"></iframe>');
	$('#pay').on('load', function(event) {
		$('#pay').fadeIn();
	});
}

function initialize() {
	watchID = navigator.geolocation.watchPosition(geo.success, geo.failure, geo.options);
}

google.maps.event.addDomListener(window, 'load', initialize);

$(document).ready(function() {
	
	FastClick.attach(document.body);
	
	$(window).on('resize', function(event) {
		$('#map-canvas').css('height', window.innerHeight - 166); // 166 = $('.header').outerHeight() + $('#main-footer').outerHeight()
		//google.maps.event.trigger(map, 'resize');
		if ($('#center_icon').is(':visible')) trueCenterIcon();
	})/**/
	.on('touchstart',function(event) {
		if (mobile_timer) clearTimeout(mobile_timer);
		mobile = 1;
		top = $(window).scrollTop();
	})
	.on('touchend',function(event) {
		mobile_timer = setTimeout(function() {
			mobile = 0;
			$('.active').removeClass('active');
		},400);
	})
	.on('scroll',function(event) {
		if (mobile) $('button').removeClass('active');
	});
	/**/
	
	$(document)/**/.on('touchstart mousedown','button,p,li',function(event) {
		var $this = $(this);
		$('.active').not($this.addClass('active')).removeClass('active');
	})
	.on('touchmove',function(event) {
		if (top != $(window).scrollTop()) $('.active').removeClass('active');
	})
	.on('mouseenter','button,p,li',function(event) {
		if (!mobile) $(this).addClass('hover');
	})
	.on('mouseleave','button,p,li',function(event) {
		$(this).removeClass('hover');
	})
	.on('mouseup',function(event) {
		$('.active').removeClass('active');
	})/**/
	.on('click', '#main-footer .Change', function(event) {
		editPosition($(this).hasClass('Drop-off'));
	})
	.on('click', '#getRoute', function(event) {
		if (window.confirmPosition) confirmPosition();
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
	.on('click', '#test', function(event) {
		draw(0, 45, -93, 10000);
		connect();
	})
	.on('click', '#becomeDriver', function(event) {
		becomeDriver();
	})
	.on('click', '#makePayment', function(event) {
		makePayment();
	})
	.on('click', '#around_the_block', function(event) {
		around_the_block();
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
	
	$('#main-footer input').on('touchstart mousedown', function(event) {
		if ((!mobile || event.type == 'touchstart') && fullscreen_input()) {
			event.preventDefault();
			event.stopImmediatePropagation();
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
					$('#main-footer').prepend($ul);
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
	
	$('.menu').on('click', function(event) {
		toggleMenu();
	});
	
	// Trigger resize event to give everything the correct placement.
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

function becomeDriver() {
	driver = true;
	socket.emit('becomeDriver');
	emitPositionUpdates();
}
function emitPositionUpdates(obj) {
	if (!obj) obj = me;
	if (!drivingListener) {
		drivingListener = google.maps.event.addListener(obj, 'position_changed', function() {
			var spot = obj.getPosition();
			if (window.io && window.socket) socket.emit('update', [spot.lat(), spot.lng()]);
		});
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
		emitPositionUpdates();
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
		/**/
		$screen.animate({'left':''});
		$sidebar.animate({'left':-$sidebar.width()}, function() { 
			$sidebar.hide();
		});
		/*
		$sidebar.add($screen).css({'transition': 'left 0.4s ease-in-out'});
		$sidebar.css({'left':-$sidebar.width()});
		$screen.css({'left':0});
		setTimeout(function() { $sidebar.hide(); }, 500);
		/**/
	}
	else {
		/**/
		$screen.animate({'left':$sidebar.width()});
		$sidebar.css({'left':-$sidebar.width()}).show().animate({'left':''});
		/*
		$sidebar.show();
		$sidebar.add($screen).css({'transition': 'left 0.4s ease-in-out'});
		$screen.css({'left':$sidebar.width()});
		$sidebar.css({'left':0});
		/**/
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
			if ($('#getRoute').is(':visible')) $('#main-footer input').filter(':visible').val(address);
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

function getDistance(p1, p2) {
	var R = 6378137; // Earth’s mean radius in meter
	var dLat = rad(p2.lat() - p1.lat());
	var dLong = rad(p2.lng() - p1.lng());
	var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(rad(p1.lat())) * Math.cos(rad(p2.lat())) * Math.sin(dLong / 2) * Math.sin(dLong / 2);
	var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	var d = R * c;
	return d; // returns the distance in meter
};

function funky() {
	var style = [ { "featureType": "road.highway", "elementType": "geometry", "stylers": [ { "hue": "#dd00ff" } ] },{ "featureType": "road.arterial", "elementType": "geometry", "stylers": [ { "hue": "#00ffdd" } ] },{ "featureType": "road.local", "elementType": "geometry", "stylers": [ { "hue": "#00ffdd" } ] },{ "featureType": "road", "elementType": "labels.text", "stylers": [ { "weight": 0.1 }, { "color": "#b18080" } ] },{ "featureType": "administrative", "elementType": "labels.text.fill", "stylers": [ { "visibility": "on" }, { "weight": 0.1 }, { "color": "#FFFFFF" } ] },{ "featureType": "administrative", "elementType": "labels.text.stroke", "stylers": [ { "color": "#808080" } ] },{ "featureType": "poi", "stylers": [ { "visibility": "off" } ] },{ } ];
	map.setOptions({styles: style});
}
function noLabels() {
	var style = [ { "elementType": "labels", "stylers": [ { "visibility": "off" } ] } ];
	map.setOptions({styles: style});
}
function normalMap() {
	map.setOptions({styles: []});
}
function driverMap() {
	var style = [ { "featureType": "administrative.neighborhood", "stylers": [ { "visibility": "off" } ] } ];
	map.setOptions({styles: style});
}