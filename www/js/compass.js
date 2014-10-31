var mobile = 0;
var mobile_timer;
var map = false;
var me = false;
var drop = false;
var route = false;
var pickup = false;
var dropoff = false;
var watchID = false;
var cars = {};
var busyCars = {};
var driver = false;
var wait = {
    directions: false,
    geocoding: false
};
var timer = {
    directions: 0,
    geocoding: 0,
    statusMessage: 0,
    waitOrDropRide: 0
};
var realtimeRoutesListener = false;
var drivingListener = false;
var startApp = true;

// This is different than the other timers as it will actually hold a time value.
var pickupTimer = false;

var geo = {
    success: function(position) {
        var crds = position.coords;
        if (geo.active) {
            draw(0, crds.latitude, crds.longitude, crds.accuracy);
        }
        else {
            geo.latitude = crds.latitude;
            geo.longitude = crds.longitude;
            // Display location change during ride if connection is lost
            if (navigator.connection && navigator.connection.type == 'none' && rideOffers.rideInProgress) {
                cars[rideOffers.driverID].setPosition(new google.maps.LatLng(geo.latitude, geo.longitude));
            }
        }
        connect();
    },
    error: function() {
        alert('Unable to find position');
        draw(0, 44.96104703638518, -93.20329773559574, 10000);
    },
    options: {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 5000
    },
    active: true
};
function connect() {
    if (window.io && !window.socket) {
        socket = io.connect('https://ridesqirl.com:8443', {
            query: 'token=' + jwt
        });
        socket.on('news', function(data) {
            console.log(data);
        })
        .on('initialize', function(data) {
            for (var i in cars) cars[i].setMap();
            cars = {};
            busyCars = data.busyCars;
            for (var id in data.freeCars) {
                draw(id, data.freeCars[id][0], data.freeCars[id][1]);
            }
            if (window.facebookConnectPlugin) {
                facebookConnectPlugin.getAccessToken(function(token) {
                    socket.emit('login', token);
                }, function(error) {
                    console.log("Couldn't get token: " + error);
                    profile.provePhone();
                });
            }
        })
        .on('canDrive', function() {
            $('#becomeDriver').attr('id','toggleDriver').html('Active Sqirl');
            if (driver) activateDriver();
        })
        .on('busyCar', function(data) {
            if (cars[data.id]) {
                var spot = cars[data.id].getPosition();
                cars[data.id].setMap();
                busyCars[data.id] = [spot.lat(), spot.lng()];
                delete cars[data.id];
            }
        })
        .on('freeCar', function(data) {
            if (busyCars[data.id]) {
                draw(data.id, busyCars[data.id][0], busyCars[data.id][1]);
                delete busyCars[data.id];
            }
        })
        .on('update', function(data) {
            if (busyCars[data.id]) {
                busyCars[data.id] = data.coordinates;
                return false;
            }
            draw(data.id, data.coordinates[0], data.coordinates[1]);
            // Say how much long it will take the driver to arrive at the rider's pickup location
            if (data.id == rideOffers.driverID) {
                
                var carGPS = cars[data.id].getPosition();
                
                if (pickupTimer) {
                    // Calculate distance endpoints are "off road" in getRoute() and add that to a proximity threshold
                    if (getDistance(me.getPosition(), carGPS) < 25 + me.offroad) {
                        console.log('Proximity detection: socket');
                        rideOffers.callbacks.arrived_at_pickup();
                    }
                    else if (Date.now() > pickupTimer + 10000) {
                        getDriverTime();
                    }
                }
                if (rideOffers.rideInProgress) {
                    me.setPosition(carGPS);
                    // Calculate distance endpoints are "off road" in getRoute() and add that to a proximity threshold
                    if (getDistance(drop.getPosition(), carGPS) < 25 + drop.offroad) {
                        console.log('Proximity detection: socket');
                        rideOffers.callbacks.arrived_at_dropoff();
                    }
                }
                else if ($('#contacting span').html() == 'Sqirl has arrived') {
                    var currentGPS = new google.maps.LatLng(geo.latitude, geo.longitude);
                    if (getDistance(currentGPS, carGPS) * 2 < getDistance(me.getPosition(), carGPS)) {
                        // ride has most likely started by now
                        rideOffers.startRide();
                        socket.emit('rideStarted', rideOffers.driverID);
                    }
                }
            }
        })
        .on('migrateRider', function(newRiderID) {
            var oldRiderID = rideRequests.current.rider;
            rideRequests.current.rider = newRiderID;
            console.log('Migrated rider from ' + oldRiderID + ' to ' + newRiderID);
        })
        .on('resumeRide', function(data) {
            console.log(data.fare, data);
            if (window.confirmPosition) confirmPosition();
            if (geo.active) {
                geo.active = false;
            }
            draw(0, data.pickup[0], data.pickup[1]);
            draw(-1, data.dropoff[0], data.dropoff[1]);
            getRoute();
            if (data.driverID) {
                rideOffers.driverID = data.driverID;
                if (busyCars[rideOffers.driverID]) {
                    draw(rideOffers.driverID, busyCars[rideOffers.driverID][0], busyCars[rideOffers.driverID][1]);
                    delete busyCars[rideOffers.driverID];
                }
                activeCar(data.driverID);
            }
            $('#main-footer').children().hide();
            $('#cancelRequest,#contacting').show();
            switch(data.status) {
                case 'accepted':
                    console.log('Status:','accepted');
                    getDriverTime();
                    $('.low.preset-tip').children('span').html((data.fare*0.15).toFixed(2));
                    $('.med.preset-tip').children('span').html((data.fare*0.20).toFixed(2));
                    $('.high.preset-tip').children('span').html((data.fare*0.25).toFixed(2));
                    $('.tip-fare span span').html(data.fare);
                    break;
                case 'enroute':
                    console.log('Status:','enroute');
                    rideOffers.startRide();
                    break;
                default:
                    break;
            }
        })
        .on('rideRequested', function(data) {
            rideRequests.receiveRequest(data);
        })
        .on('rideOffered', function(data) {
            rideOffers.showOffer(data);
        })
        .on('rideAccepted', function() {
            console.log('Ride accepted');
            $('#offerAccepted,.getDirections').show();
            $('#waitingForResponse').hide();
        })
        .on('rideStarted', function(data) {
            if (data == rideOffers.driverID) {
                rideOffers.startRide();
            }
            else if (data == rideRequests.current.rider) {
                rideRequests.startRide();
            }
        })
        .on('rideCanceled', function(data) {
            rideRequests.cancelRequest(data.rider);
        })
        .on('rideDropped', function() {
            deactivateRide();
            if (statusMessage.hide) statusMessage.hide();
        })
        .on('ridePaidByTimer', function() {
            deactivateRide(true);
        })
        .on('cardDeclined', function(data) {
            console.log('Card declined:', data.code);
            var $pay = $('#credit-card-info');
            $pay.find('button').prop('disabled', false);
            var $declined = $pay.next('.declinedCard').fadeIn();
            setTimeout(function() {
                $declined.fadeOut();
            }, 1400);
        })
        .on('cardError', function(data) {
            console.log('Card error', data);
        })
        .on('cardAccepted', function(data) {
            console.log('Card accepted!');
            if (rideOffers.acceptOffer) {
                delete rideOffers.acceptOffer;	
            }
            if (rideOffers.activateRide) {
                rideOffers.activateRide();
            }
            $('#credit-card').fadeOut({
                complete: function() {
                    $('#credit-card-info input').val('').filter('.cc-number').attr('class','cc-number');
                    $('#credit-card-info button').prop('disabled', false).filter('[type="submit"]').attr('class','multi-use');
                }
            });
        })
        .on('listCards', function(data) {
            for (var i=0, l=data.length; i<l; ++i) {
                var brand = data[i].brand;
                if (brand == 'American Express') {
                    brand = 'amex';
                }
                else {
                    brand = brand.toLowerCase().replace(/\s/g,'');
                }
                if ($('.payment-cc[data-id="' + data[i].id + '"]').length == 0) {
                    $('#payment-info #payment-add-card').before($('<p />', {
                        'data-id': data[i].id,
                        class: 'payment-cc ' + brand + (data[i].default_card ? ' checked' : ''), 
                        text: data[i].last4
                    }));
                }
            }
        })
        .on('bankError', function(data) {
            console.log('Bank error', data);
        })
        .on('bankAccepted', function(data) {
            $('#bank').fadeOut({
                complete: function() {
                    $('#bank-info input').val('');	
                    $('#bank-info button').prop('disabled', false);
                }
            });
        })
        .on('listBank', function(data) {
            $('.earnings-account-bank_name').html(data.bank_name);
            $('.earnings-account-last4').html(data.last4);
            $('.earnings-account').show();
            $('#earnings-add-account button').html('Edit Account');
        })
        .on('listEarnings', function(data) {
            if (data) {
                if (data.owed) {
                    $('#earnings-owed span').html(Number(data.owed).toFixed(2));
                }
                if (data.total) {
                    $('#earnings-total span').html(Number(data.total).toFixed(2));
                }
            }
        })
        .on('phoneRegistered', function(phoneNumber) {
            var verificationCode = prompt('A verification code has been sent to ' + phoneNumber + '\nEnter that code here:');
            socket.emit('verifyPhone', verificationCode);
        })
        .on('phoneWrongCode', function(attempts) {
            if (attempts) {
                var verificationCode = prompt('Incorrect verification code.\nTry again:');
                socket.emit('verifyPhone', verificationCode);
            }
            else {
                alert('Incorrect verification code.\nReached attempt limit.');
            }
        })
        .on('phoneVerified', function(data) {
            window.localStorage.setItem('phone', data.phone);
            window.localStorage.setItem('proof', data.proof);
            socket.emit('provePhone', data);
        })
        .on('phoneProved', function(data) {
            var phoneDisplay = data.phone.slice(0,3) + '-' + data.phone.slice(3,6) + '-' + data.phone.slice(6);
            $('#profile-phone .fa-phone').next().html(phoneDisplay);
            $('#profile-container,#profile-phone,#payment-info,#earnings-info').show();
            $('.screen-login,#profile-info,#profile-signup').hide();
        })
        .on('loginSuccess', function() {
            console.log('Login successful');
            // requestRide after logging in if the login was caused by clicking #requestRide
            if (typeof window.requestRide === 'function') {
                window.requestRide();
                delete window.requestRide;
                $('#main').find('.screen-login').remove();
            }
        })
        .on('defaultCard', function(data) {
            var $cards = $('.payment-cc');
            var $defaultCard = $cards.filter('[data-id="' + data + '"]');
            $cards.not($defaultCard).removeClass('checked');
            $defaultCard.addClass('checked');
        })
        .on('TwilioToken', function(token) {
            try {
                Twilio.Device.setup(token);
            }
            catch(e) {
                console.log('Twilio is not active.');
            }
        })
        .on('leave', function(data) {
            if (cars[data.id]) {
                cars[data.id].setMap();
                delete cars[data.id];
            }
            else if (busyCars[data.id]) {
                delete busyCars[data.id];
            }
            else if (driver) {
                if (rideRequests.current && rideRequests.current.rider == data.id) {
                    console.log('Your rider has lost connection');
                    // I think it makes sense to cancel requests of rides that haven't been accepted yet.
                    if ($('.offerRide,#waitingForResponse').is(':visible')) {
                        rideRequests.cancelRequest(data.id);
                    }
                }
                // Cancel any lost connections in queue
                else {
                    rideRequests.cancelRequest(data.id);
                }
            }
        });
    }
}

// DRIVER
var rideRequests = {
    receiveRequest: function(data) {
        if (this.current) {
            if (this.current.rider == data.rider) {
                this.current = data;
                this.showRequest(data);
            }
            else {
                this.removeRiderFromQueue(data.rider);
                this.queue.push(data);
            }
        }
        else {
            this.showRequest(data);
        }
    },
    showRequest: function(data) {
        if (!data) return false;
        function drawSpot(endpoint) {
            if (window[endpoint]) window[endpoint].setMap();
            var markerOptions = {
                clickable: false,
                map: map,
                icon: {
                    url: 'img/markers/' + (endpoint == 'pickup' ? 'dropoffAcorn' : 'dropoffTree') + '.png',
                    scaledSize: new google.maps.Size(25,30)
                },
                optimized: false,
                position: new google.maps.LatLng(data[endpoint][0], data[endpoint][1])
            };
            var obj = new google.maps.Marker(markerOptions);
            window[endpoint] = obj;
        }
        $(window).resize();
        drawSpot('pickup');
        drawSpot('dropoff');
        this.current = data;
        
        $('#driver-footer').find('*').css('display','');
        console.log(data.traffic);

        getImage(data, function(src) {
            $('#driver-footer').css('bottom','-120px').show().stop().animate({'bottom':'0'}, {
                progress: function() {
                    $('#map-canvas').css('height',window.innerHeight - 44 - parseInt($('#driver-footer').css('bottom'),10) - 120);	
                }
            });
            $('.riderPic').attr('src', src);
        });

        var destination = dropoff.getPosition();
        var waypoints = [{location: pickup.getPosition()}];
        $('#map-canvas').css('height',window.innerHeight - 164);
        google.maps.event.trigger(map, 'resize');
        getRoute(destination, waypoints, 0, data.traffic);
        $('#map-canvas').css('height',window.innerHeight - 44);
    },
    cancelRequest: function(rider) {
        if (this.current && this.current.rider == rider) {
            var data = this.queue.shift();
            this.current = false;
            this.hideRequest(function() {
                rideRequests.showRequest(data);
            });
            me.setIcon({
                url: 'img/markers/enrouteSqirl.png',
                scaledSize: new google.maps.Size(51,38)//(57,36)
            });
            if (window.socket) socket.emit('freeDriver');
        }
        else {
            this.removeRiderFromQueue(rider);
        }
    },
    hideRequest: function(callback) {
        $('#driver-footer').stop().animate({'bottom':'-120px'}, {
            progress: function() {
                $('#map-canvas').css('height',window.innerHeight - 44 - parseInt($('#driver-footer').css('bottom'),10) - 120);	
            },
            complete: function() {
                $('#driver-footer').hide();
                if (typeof callback === 'function') callback();
            }
        });
        if (route) {
            route.setMap();
            route = false;
        }
        if (dropoff) {
            dropoff.setMap();
            dropoff = false;
        }
        if (pickup) {
            pickup.setMap();
            pickup = false;
        }
        if (window.info) for (var i=0, l=info.length; i<l; ++i) {
            if (info[i]) info[i].setMap();
        }
        info = [];
        if (Twilio.Device.destroy) {
            Twilio.Device.destroy();
        }
        else {
            Twilio.Device.setup('');
        }
    },
    removeRiderFromQueue: function(rider) {
        for (var i=0; i<this.queue.length; ++i) {
            if (this.queue[i].rider == rider) {
                this.queue.splice(i,1);
                break;
            }
        }
    },
    queue: [],
    current: false,
    startRide: function() {
        me.setIcon({
            url: 'img/markers/enrouteSqirl.withAcorn.png',
            scaledSize: new google.maps.Size(63,38)
        });
        pickup.setVisible(false);
        $('#arrived-Pick-up,.startRide').hide();
        $('#drive-in-progress,.getDirections').show();
        rideRequests.rideInProgress = true;
        rideRequests.measured_distance = 0;
        rideRequests.last_point = me.getPosition();
        rideRequests.start_time = Date.now();
        
        // Just for aesthetics when demo'ing
        if (window.confirmPosition) {
            $('#center_icon').css('background-image', 'url("' + me.getIcon().url + '")');
        }
    },
    measured_distance: 0,
    last_point: false,
    finishRide: function() {
        socket.emit('measurementsForRide', {
            duration: (Date.now() - rideRequests.start_time) / 1000,
            distance: rideRequests.measured_distance,
            rider: rideRequests.current.rider
        });
        rideRequests.rideInProgress = false;
        delete rideRequests.start_time;
        socket.emit('finishRide', rideRequests.current.rider);
        rideRequests.cancelRequest(rideRequests.current.rider);
        
        // Just for aesthetics when demo'ing
        if (window.confirmPosition) {
            confirmPosition();
        }
    }
};

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
        // might not be useful if we default to editing pick-up position
        /*
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
        /**/
    }
    var markerOptions = {
        clickable: false,
        map: map,
        icon: {
            scaledSize: new google.maps.Size(25,30)
        },
        optimized: false,
        position: map.center
    };
    if (!index) {
        if (!me) {
            markerOptions.icon.url = 'img/markers/dropoffAcorn.png';
            me = new google.maps.Marker(markerOptions);
        }
        var obj = me;
    }
    else if (index === -1) {
        if (!drop) {
            markerOptions.icon.url = 'img/markers/dropoffTree.png';
            drop = new google.maps.Marker(markerOptions);
        }
        var obj = drop;
    }
    else {
        if (!cars[index]) {
            markerOptions.icon = {
                url: 'img/markers/availableSqirl.png', // 'img/Google Maps Markers/black_Marker.png',
                scaledSize: new google.maps.Size(51,38)//(57,36)
            };
            cars[index] = new google.maps.Marker(markerOptions);
        }
        var obj = cars[index];
    }
    if (typeof(accuracy) === 'undefined' || accuracy < 120) {
        obj.setPosition(spot);
        if (startApp && !index) {
            if (!window.confirmPosition) editPosition();
            else {
                trueCenterIcon(me);
                map.panTo(spot);
                geo.active = false;
            }
            startApp = false;
        }
    }
    /**/
    else if (startApp && !index && !window.confirmPosition) {
        editPosition();
        $('#map-canvas,input.Pick-up,button.Drop-off').one('mousedown', function(event) {
            startApp = false;
            geo.active = false;
        });
        geo.active = true;
    }
    /**/
}

function editPosition(setDrop) {
    if (window.confirmPosition) confirmPosition();
    if (route && !driver) {
        route.setMap();
        route = false;
    }
    if (geo.active) {
        geo.active = false;
    }
    var obj = me;
    if (setDrop) {
        if (!drop) {
            draw(-1, map.center.lat(), map.center.lng());
            $('.Change.Drop-off').html('Change Drop-off');
        }
        obj = drop;
    }
    map.panTo(obj.getPosition());
    $('#center_icon').css('background-image', 'url("' + obj.getIcon().url + '")');
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
            var cost = getCost(directions, traffic).toFixed(2);
            $('#cost > span').attr('data-msrp',cost).html(cost);

            if (noZoom) giveInstructions(directions);
            else if (waypoints) {
                var riderLeg = directions.routes[0].legs[1];
                if (pickup) {
                    pickup.address = riderLeg.start_address.split(',')[0];
                    pickup.offroad = getDistance(pickup.getPosition(), riderLeg.start_location);
                }
                if (dropoff) {
                    dropoff.address = riderLeg.end_address.split(',')[0];
                    dropoff.offroad = getDistance(dropoff.getPosition(), riderLeg.end_location);
                }
            }
            else {
                var leg = directions.routes[0].legs[0];
                if (me) {
                    me.offroad = getDistance(me.getPosition(), leg.start_location);
                }
                if (drop) {
                    drop.offroad = getDistance(drop.getPosition(), leg.end_location);
                }
                if (window.socket) {
                    socket.emit('estimatesForRide', {
                        distance: leg.distance.value,
                        duration: leg.duration.value
                    });
                }
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
        preserveViewport: !!noZoom/**/,
        polylineOptions: {
            strokeColor: '#543',				// 'rgb(0, 94, 255)' is the default color Google uses
            strokeOpacity: 0.45,						//	with an opacity of 0.55
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
    var initial_cost = 1.5;
    var distance_cost = 0.001;	// $ per meter						= 1.609/mile
    var duration_cost = 0.005;	// $ per second (experimental)		= 0.300/minute

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
    cost += initial_cost;
    return Math.max(cost,5);	
}

function midPoints(directions, traffic) {
    var legs = directions.routes[0].legs;
    if (legs.length == 1) return false;
    traffic = traffic || 1;
    if (window.info) for (var i=0, l=info.length; i<l; ++i) {
        if (info[i]) info[i].setMap();
    }
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
                        icon: {
                            url: 'https://ridesqirl.com:8443/svg?text=' + Math.ceil(time/60 * legTraffic)
                        }
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
                        $('#cost > span').attr('data-eta', Math.ceil(t/60 * traffic));
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

function makePayment(fare) {
    if ($('.payment-cc').length > 0) {
        /*
        if (window.cordova) {
            function resultCallback(buttonIndex) {
                if (buttonIndex == 2) rideOffers.acceptOffer();
            }
            navigator.notification.confirm(null, resultCallback, 'This trip will cost $' + fare, ['Cancel','OK']);
        }
        else if (confirm('This trip will cost $' + fare)) rideOffers.acceptOffer();
        */
        customDialog.cost(fare);
        $('#modal').fadeIn(100);
    }
    else {
        if (fare) {
            $('#credit-card-info').find('button[type="submit"]').attr('data-fare',fare).attr('class','single-use');
        }
        $('#credit-card').fadeIn();
    }
}

function ellipses($element) {
    var length = $element.attr('data-ellipses').length;
    switch (length) {
        case 0:
            $element.attr('data-ellipses','.');
            break;
        case 1:
            $element.attr('data-ellipses','..');
            break;
        case 2:
            $element.attr('data-ellipses','...');
            break;
        case 3:
            $element.attr('data-ellipses','');
            break;
    }
    setTimeout(function() {
        ellipses($element);
    }, 400);
}

function getImage(data, callback) {
    var img = new Image();
    // Execute callback once image loads
    img.onload = function() {
        if (typeof callback === 'function') {
            callback(img.src);
        }
    }
    if (data.fbID) {
        // picture for people identified with facebook
        img.src = 'https://graph.facebook.com/v2.0/' + data.fbID + '/picture?width=160&height=160';
    }
    else if (data.url) {
        // picture from general url
        img.src = data.url;
    }
    else {
        // picture for unidentified people
        img.src = 'https://ridesqirl.com:8443/app/img/unidentified.png';
    }
    return img.src;
}

// RIDER
var rideOffers = {
    resize: function() {
        $('#ride-offers').height($('#map-canvas').height());
        $('.ridePrice,.driverETA').css('line-height', function() { return $(this).css('height'); });
    },
    showOffer: function(data) {
        $('#ride-offers').show();
        var $rideOffer = $('.rideOffer').not(':visible,.wasVisible').eq(0);

        getImage(data, function(src) {
            if ($('.rideOffer.expanded').length > 0) {
                $rideOffer.addClass('wasVisible');
            }
            else {
                $rideOffer.fadeIn({
                    start: rideOffers.resize
                });
            }
            $rideOffer.children('.driverPic').css('background-image','url("' + src + '")');
            // preload picture of car after the driver's picture has finished loading
            getImage({url: data.car.pic});
        });

        $rideOffer.find('.driverETA span').html(data.eta);
        $rideOffer.find('.ridePrice span').html(data.fare);
        $rideOffer.off('click', '.acceptRide').on('click', '.acceptRide', function(event) {
            rideOffers.acceptOffer = function(token) {
                if (window.io && window.socket) {
                    data.token = token;
                    socket.emit('acceptRide', data);
                    rideOffers.activateRide = constructRideActivator(data.driver);
                }
            };
            makePayment(data.fare);
            $('.low.preset-tip').children('span').html((data.fare*0.15).toFixed(2));
            $('.med.preset-tip').children('span').html((data.fare*0.20).toFixed(2));
            $('.high.preset-tip').children('span').html((data.fare*0.25).toFixed(2));
            $('.tip-fare span span').html(data.fare);
            
            var $car = $rideOffer.find('.driverCar');
            statusMessage.car($car.css('background-image').slice(4,-1).replace(/'|"/g,''), $car.height(), $car.width());
        });
        $rideOffer.off('click', '.driverPic').on('click', '.driverPic', function(event) {
            if ($rideOffer.hasClass('expanded')) {
                rideOffers.shrinkOffer($rideOffer);
            }
            else {
                rideOffers.expandOffer($rideOffer);
            }
        });
        
        $rideOffer.find('.driverName').html(data.firstName);
        
        $rideOffer.find('.driverCar').attr({
            'data-year': data.car.year,
            'data-make': data.car.make,
            'data-model': data.car.model
        }).css({
            'background-image': 'url("' + data.car.pic + '")'
        });
        
        $rideOffer.find('.driverFunfact p').html(data.funfact);
    },
    expandOffer: function($offer) {
        if (!$offer) $offer = $('.rideOffer').eq(0);
        var percent = (window.innerHeight > 414) ? 33.33 : 50;
        $offer.children().each(function() {
            var $this = $(this);
            $this.css({
                height: this.getBoundingClientRect().height,
                top: $this.position().top + 'px'
            });
        });
        $offer.css({
            position: 'absolute',
            top: $offer.index() * percent + '%'
        }).animate({
            height: '100%',
            top: 0
        }, function() {
            $offer.addClass('expanded').css({
                position: '',
                height: '',
                top: ''
            });
            $offer.children().css({
                height: '',
                top: ''
            });
        });
        $('.rideOffer').filter(':visible').addClass('wasVisible');
        $('.rideOffer').not($offer).hide();
        
        $offer.find('.driverFunfact p').filter(function() { return this.innerHTML == ''; }).hide();
    },
    shrinkOffer: function($offer) {
        if (!$offer) $offer = $('.rideOffer').eq(0);
        var percent = (window.innerHeight > 414) ? 33.33 : 50;
        $offer.children().each(function() {
            var $this = $(this);
            $this.css({
                height: this.getBoundingClientRect().height,
                top: $this.position().top + 'px'
            });
        });
        $offer.css({
            position: 'absolute',
            top: 0
        }).animate({
            height: percent + '%',
            top: $offer.index() * percent + '%'
        }, function() {
            $offer.removeClass('expanded').css({
                position: '',
                height: '',
                top: ''
            });
            $offer.children().css({
                height: '',
                top: '',
                display: ''
            });
            $('.rideOffer.wasVisible').fadeIn({
                duration: 200,
                start: rideOffers.resize
            }).removeClass('wasVisible');
        });
        $offer.children('.driverName,.driverCar,.driverFunfact').hide();
    },
    showTipConfirmation: function(tip, callback) {
        rideOffers.farePlusTip(tip);
        $('.select-tip').fadeOut();
        $('.confirm-tip').fadeIn({
            complete: function() {
                if (typeof callback === 'function') {
                    callback();
                }
            }
        });
    },
    farePlusTip: function(tip) {
        $('.tip-tip span span').html(tip);
        tip = Number(tip);
        var fare = Number($('.tip-fare span span').html());
        $('.tip-total span span').html((fare + tip).toFixed(2));
    },
    startRide: function() {
        rideOffers.rideInProgress = true;
        cars[rideOffers.driverID].setIcon({
            url: 'img/markers/enrouteSqirl.withAcorn.png',
            scaledSize: new google.maps.Size(63,38)
        });
        me.setVisible(false);
        $('#contacting span').html('Ride in progress').attr('data-ellipses','.');
        
        if (statusMessage.hide) statusMessage.hide();
    },
    endRide: function() {
        // Need to think about this more
        // socket.emit('endRide');
        // What will that look like on the driver's screen?
        //$('#tip').fadeIn().children().css('display','');
        // What else should be displayed on the rider's screen?
    },
    callbacks: {
        // Maybe want to move back to getDriverTime()
        approaching: function(leg) {
            var duration = leg.duration;
            $('#contacting span').html(duration.text + ' until Sqirl arrives').attr('data-ellipses','.');
            pickupTimer = Date.now();
        },
        arrived_at_pickup: function() {
            $('#contacting span').html('Sqirl has arrived').attr('data-ellipses','.');
            
            if (window.plugin && window.plugin.notification && window.plugin.notification.local) {
                window.plugin.notification.local.add({date: new Date(), message: 'Sqirl has arrived', autoCancel: true});
                window.plugin.notification.local.hasPermission(function(granted) {
                    if (!granted) window.plugin.notification.local.promptForPermission();
                });
            }
            pickupTimer = false;
            
            if (statusMessage.show) statusMessage.show();
        },
        arrived_at_dropoff: function() {
            $('#contacting span').html('You have arrived at your destination').attr('data-ellipses','.');
            rideOffers.rideInProgress = false;
            $('#cancelRequest').hide();
            $('#main-footer .thanks').show();
            $('#tip').fadeIn().children().css('display','');
        }
    }
}

function constructRideActivator(driverID) {
    var f = function() {
        this.driverID = driverID;
        activeCar(driverID);
        getDriverTime();
        $('.rideOffer').fadeOut({
            complete: function() {
                $('#ride-offers').hide();	
            }
        });
        delete this.activateRide;
    };
    return f;
}
function getDriverTime(obj, onsuccess, onfail, car) {
    if (!obj) obj = me;
    if (!car) car = cars[rideOffers.driverID];
    if (typeof onsuccess !== 'function') {
        onsuccess = rideOffers.callbacks.arrived_at_pickup;
    }
    if (typeof onfail !== 'function') {
        onfail = rideOffers.callbacks.approaching;
    }
    var directionsRequest = {
        origin: car.getPosition(),
        destination: obj.getPosition(),
        travelMode: 'DRIVING'
    };
    var query = new google.maps.DirectionsService();
    query.route(directionsRequest, function(directions, status) {
        if (status == google.maps.DirectionsStatus.OK) {
            var leg = directions.routes[0].legs[0];
            if (leg.distance.value < 50) {
                // Covers a tiny portion of edge cases, but doesn't really cost anything
                console.log('Proximity detection: google query');
                onsuccess();
            }
            else {
                onfail(leg);
            }
        }
    });
}
function deactivateRide(resetDrop) {
    $('#tip').fadeOut();
    if (resetDrop) {
        drop.setMap();
        drop = false;
    }
    $('#main-footer').children('.Change,#requestRide').show();
    $('#cancelRequest,#contacting,.rideOffer,#ride-offers,#main-footer .thanks').hide();
    if (rideOffers.driverID) {
        deactiveCar(rideOffers.driverID);
        delete rideOffers.driverID;
        delete rideOffers.rideInProgress;
    }
    if (Twilio.Device.destroy) {
        Twilio.Device.destroy();
    }
    else {
        Twilio.Device.setup('');
    }
    if (route) {
        route.setMap();
        route = false;
    }
    pickupTimer = false;
    $('#contacting span').html('contacting Sqirls').attr('data-ellipses','...');
    $('.rideOffer').removeClass('expanded wasVisible');
    editPosition();
}

function activeCar(driverID) {
    if (cars[driverID]) {
        cars[driverID].setIcon({
            url: 'img/markers/enrouteSqirl.png', // 'img/Google Maps Markers/black_Marker.png',
            scaledSize: new google.maps.Size(51,38)//(57,36)
        });
    //    cars[driverID].setIcon('img/Google Maps Markers/active_Marker.png');
    }
}
function deactiveCar(driverID) {
    if (cars[driverID]) {
        cars[driverID].setIcon({
            url: 'img/markers/availableSqirl.png',
            scaledSize: new google.maps.Size(51,38)//(57,36)
        });
    }
    me.setVisible(true);
}

function initialize() {
    watchID = navigator.geolocation.watchPosition(geo.success, geo.failure, geo.options);
}

google.maps.event.addDomListener(window, 'load', initialize);

$(document).ready(function() {

    FastClick.attach(document.body);

    $(window).on('resize', function(event) {
        if (window.android) return;
        if (driver && $('#driver-footer').css('display').toLowerCase() == 'none') {
            $('#map-canvas').css('height', window.innerHeight - 44);
        }
        else {
            $('#map-canvas').css('height', window.innerHeight - 164);
        }
        google.maps.event.trigger(map, 'resize');
        if ($('#center_icon').is(':visible')) trueCenterIcon();

        rideOffers.resize();
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
    .on('click', '#requestRide', function(event) {
        function requestRide() {
            if (window.confirmPosition) confirmPosition();

            // Show "Aww, nuts" if there aren't any drivers
            if (Object.keys(cars).length == 0) {
                console.log('Aww nuts');
                statusMessage('No Sqirls are available at this time.');
                return false;
            }
            if (!drop) {
                // Check if there's a default (home) address
                // Otherwise, let the user know a drop-off is needed and return false
                statusMessage('Please enter a drop-off location.');
                return false;
            }
            getRoute();

            if (window.io && window.socket) {
                $('#main-footer').children().hide();
                $('#cancelRequest,#contacting').show();
                //ellipses($('#contacting span'));
                var data = {
                    pickup: me.getPosition(),
                    dropoff: drop.getPosition()
                };
                data.pickup = [data.pickup.lat(), data.pickup.lng()];
                data.dropoff = [data.dropoff.lat(), data.dropoff.lng()];
                socket.emit('requestRide', data);
            }
        }
        facebookConnectPlugin.getAccessToken(requestRide, function() {
            var $login = $('.screen-login').eq(0).clone();
            $login.css('background-color','rgba(0,0,0,0.4)');
            $('#main').append($login);
            window.requestRide = requestRide;
            profile.provePhone();
        });
    })
    .on('click', '#cancelRequest', function(event) {
        if (route) {
            route.setMap();
            route = false;
        }
        if (window.io && window.socket) {
            socket.emit('cancelRide');
            deactivateRide();
        }
        if (statusMessage.hide) statusMessage.hide();
    })
    .on('click', '.collapse', function(event) {
        small_input();
    })
    .on('click', '.clear', function(event) {
        $('#main-footer input').filter(':visible').val('').attr('placeholder','').focus();
    })
    .on('click', '.fare', function(event) {
        var $this = $(this);
        var $cost = $('#cost > span');
        var fare = Number($cost.html());
        var msrp = Number($cost.attr('data-msrp'));
        var test = fare < msrp;
        var edge = fare == msrp;
        var delta = Math.round(msrp*0.2) * 0.25;
        var method = 'floor';
        if ($this.hasClass('decrease')) {
            delta *= -1;
            method = 'ceil';
        }
        fare += delta;
        fare = Math[method](fare * 4) * 0.25;
        if (!edge && (fare < msrp) != test) fare = msrp;
        if (fare < 5) fare = 5;
        var diff = Math.abs(msrp - fare);
        if (diff <= msrp*0.2) $cost.html(fare.toFixed(2));
    })
    .on('click', '.offerRide', function(event) {
        var d = {
            rider: rideRequests.current && rideRequests.current.rider,
            fare: $('#cost span').html(),
            eta: $('#cost span').attr('data-eta'),
            msrp: $('#cost span').attr('data-msrp')
        }
        socket.emit('offerRide',d);
        $('#riderResponse').show();
        $('#pricing,.offerRide').hide();
    })
    .on('click', '.getDirections', function(event) {
        var destination = ($('#drive-in-progress').is(':visible') ? dropoff : pickup).getPosition();
        var url = {
            apple: 'http://maps.apple.com/',
            google_ios: 'comgooglemaps-x-callback://',
            google_droid: 'https://maps.google.com/maps',
            waze: 'waze://'
        };
        for (var i in url) {
            url[i] += '?saddr=' + me.getPosition().lat() + ',' + me.getPosition().lng()
            url[i] += '&daddr=' + destination.lat() + ',' + destination.lng();
        }
        if (window.navigator && window.navigator.standalone) {
            window.open(url.apple, '', null);
        }
        else if (window.cordova /* && device.platform == 'iOS' */) {
            window.open(url.apple, '_system', null);
        }
        else {
            window.open(url.google_droid, '', null);
        }
    })
    .on('click', '.startRide', function(event) { 
        rideRequests.startRide();
        if (window.io && window.socket) {
            socket.emit('startRide', rideRequests.current.rider);
        }
    })
    .on('click', '.finishRide', function(event) {
        rideRequests.finishRide();
    })
    .on('click', '.custom-tip', function(event) {
        /*
        var tip = prompt('Custom tip:');
        if (tip) {
            tip = Number(tip).toFixed(2);
            rideOffers.showTipConfirmation(tip);
        }
        */
        rideOffers.showTipConfirmation('0.00', function() {
            $('.tip-tip input').focus();
        });
        $('.tip-tip input').show().val('');
        $('.tip-tip span span').hide();
    })
    .on('click', '.preset-tip', function(event) {
        var tip = $(this).children('span').html();
        rideOffers.showTipConfirmation(tip);
        $('.tip-tip input').hide();
        $('.tip-tip span span').show();
    })
    .on('click', '.no-tip', function(event) {
        var tip = '0.00';
        rideOffers.showTipConfirmation(tip);
    })
    .on('click', '.tip-back', function(event) {
        $('.tip-tip input').hide();
        $('.tip-tip span span').show();
        $('.confirm-tip').fadeOut();
        $('.select-tip').fadeIn();
    })
    .on('click', '.tip-confirm', function(event) {
        deactivateRide(true);
        var tip = $('.tip-tip span span').html();
        socket.emit('tipForRide', tip);
    })
    .on('click', '#test', function(event) {
        if (!me) {
            draw(0, 45.03293, -93.18358, 100);
            connect();
        }
        changeScreen('main');
    })
    .on('click', '#becomeDriver', function(event) {
        changeScreen('signup');
    })
    .on('click', '#toggleDriver', function(event) {
        if (driver) hibernateDriver();
        else activateDriver();
    })
    .on('click', '#showFAQ', function(event) {
        var url = 'https://ridesqirl.com:8443/faq.html';
        window.open(url, '_system', null);
        //changeScreen('faq');
    })
    .on('click', '#inviteFriends', function(event) {
        changeScreen('invite');
    })
    .on('click', '#showProfile', function(event) {
        changeScreen('profile');
    })
    .on('click', '.fb-login', function(event) {
        profile.login();
    })
    .on('click', '.phone-login', function(event) {
        var phoneNumber = prompt('Phone number:');
        if (phoneNumber) {
            phoneNumber = phoneNumber.replace(/\D/g,'');
            if (phoneNumber.length == 10) {
                socket.emit('registerPhone', phoneNumber);
            }
        }
    })
    .on('click', '.fb-invite', function(event) {
        if (window.navigator && window.navigator.standalone) {
            var url = 'https://www.facebook.com/dialog/share';
            url += '?app_id=667802789972584';
            url += '&display=popup';
            url += '&href=https://ridesqirl.com';
            url += '&redirect_uri=' + document.location.href;
            window.open(url, '', null); 
        }
        else {
            facebookConnectPlugin.showDialog({
                method: 'share',
                href: 'https://ridesqirl.com'
            }, function(response) {
                console.log(response);
            }, function(error) {
                console.log(error);
            });
        }
    })
    .on('click', '.twitter-invite', function(event) {
        var url = 'https://twitter.com/intent/tweet';
        url += '?text=RideSqirl is a new rideshare app in the Twin Cities. Check it out:';
        url += '&url=https://ridesqirl.com';
        var top = 0;
        var left = 0;
        if (screen.height > 420) {
            top = Math.round((screen.height - 420) / 2);
        }
        if (screen.width > 550) {
            left = Math.round((screen.width - 550) / 2);
        }
        var ref = window.open(url, '_blank', 'location=no,width=550,height=420,top=' + top + ',left=' + left + ',closebuttoncaption=Cancel');
        ref.addEventListener('loadstart', function(event) {
            if (event.url.split('?')[0] == 'https://twitter.com/intent/tweet/complete') {
                ref.close();
            }
        }, false);
    })
    .on('click', '#profile-signup', function(event) {
        changeScreen('signup', true);
    })
    .on('click', '#profile-logout', function(event) {
        profile.logout();
    })
    .on('click', '#makePayment', function(event) {
        changeScreen('payment');
    })
    .on('click', '#payment-add-card button', function(event) {
        $('#credit-card').fadeIn();
    })
    .on('click', '.payment-cc', function(event) {
        if (window.io && window.socket) {
            socket.emit('defaultCard', $(this).attr('data-id'));
        }
    })
    .on('click', '#checkEarnings', function(event) {
        changeScreen('earnings');
    })
    .on('click', '#earnings-add-account button', function(event) {
        $('#bank').fadeIn();
    })
    .on('click', '.call', function(event) {
        Twilio.Device.connect({});
        customDialog.phone().call();
        $('#modal').fadeIn();
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
        // special shortcuts for demo'ing
        else if (event.altKey && driver) {
            if (event.which == 69) {
                editPosition();
            }
            if (event.which == 67) {
                if (window.confirmPosition) confirmPosition();
            }
        }
    });

    $('#main-footer input').on('touchstart mousedown', function(event) {
        if ((!mobile || event.type == 'touchstart') && fullscreen_input()) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return false;
        }
    }).on('input', function(event) {
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
                    if (results) for (var i=0, l=results.length; i<l; ++i) {
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
    
    $('.signup-checklist').on('click', 'p', function(event) {
        var $this = $(this);
        $this.toggleClass('checked');
        
        if ($this.siblings('p').not('.checked').length == 0) {
            if ($this.parent('.signup-checklist').is('.personal')) {
                $('.signup-checklist.personal').fadeOut();
                $('.signup-checklist.vehicle').fadeIn();
            }
            else {
                $('.signup-checklist.vehicle').fadeOut();
                $('#signup-vehicle').fadeIn(function() {
                    var $input = $('#signup-vehicle input').eq(0);
                    if ($input.val() == '') {
                        $input.focus();
                    }
                });
            }
        }
    });
    
    $('#signup-vehicle').on('click', '.back', function(event) {
        $('.signup-checklist.personal').fadeIn();
        $('#signup-vehicle').fadeOut();
        $('.signup-checklist p').removeClass('checked');
    }).on('click', '.next', function(event) {
        $('#signup-vehicle').fadeOut();
        $('#signup-contact').fadeIn(function() {
            var $input = $('#signup-contact input').eq(0);
            if ($input.val() == '') {
                $input.focus();
            }
        });
    });
    
    $('#signup-contact').on('click', '.back', function(event) {
        $('#signup-vehicle').fadeIn();
        $('#signup-contact').fadeOut();
    }).on('click', '.next', function(event) {
        $('#signup-contact').fadeOut();
        $('#signup-extra').fadeIn(function() {
            var $dob = $('#signup [name="dob"]');
            if ($dob.val() == '') {
                var d = new Date();
                d.setYear(d.getYear() - 21);
                try {
                    $dob[0].valueAsDate = d;
                }
                catch(e) {
                    console.log(e);
                }
                $dob.one('focus', function(event) {
                    this.value = '';
                }).focus();
            }
        });
    });
    
    $('#signup-extra').on('click', '.back', function(event) {
        $('#signup-contact').fadeIn();
        $('#signup-extra').fadeOut();
    }).on('click', '.submit', function(event) {
        var data = $('#signup-form').serialize();
        function done() {
            console.log(data);
            /**/
            $.post('https://ridesqirl.com:8443/signup', data, function(response) {
                console.log(response);
                $('#signup-extra').fadeOut();
                $('#signup-success').fadeIn();
            }).fail(function() {
                console.log('Failed', arguments);
            });
            /**/
        }
        facebookConnectPlugin.getAccessToken(function(token) {
            data += '&access_token=' + token;
            done();
        }, function(error) {
            var phone = $('#signup-form input[name="phone"]').val().replace(/\D/g,'');
            var login = window.localStorage.getItem('phone');
            if (phone == login) {
                data += '&proof=' + window.localStorage.getItem('proof');
                done();
            }
            else {
                console.log('Logged in with phone number that doesn\'t match number listed in signup form.');
            }
        });
    });

    $('.menu').on('click', function(event) {
        toggleMenu();
    });
    
    $('#bank-info').on('submit', function(event) {
        var $form = $('#bank-info');
		$form.find('button').prop('disabled', true);
        Stripe.bankAccount.createToken({
            country: 'US',
            routingNumber: $('.routing-number').val(),
            accountNumber: $('.account-number').val()
        }, function(status, response) {
            if (response.error) {
                console.log(status, response.error);
                $form.find('button').prop('disabled', false);
            }
            else {
                socket.emit('saveBank', {
                    token: response.id
                });
            }
        });
        return false;
    }).on('click', '.cancel', function(event) {
		$('#bank').fadeOut({
			complete: function() {
				$('#bank-info input').val('');	
				$('#bank-info button').prop('disabled', false);
			}
		});
	});
    
    $('.tip-tip input').on('input', function(event) {
        var $this = $(this);
        var tip = ($this.val().replace('.','') / 100).toFixed(2);
        $this.val(tip);
        rideOffers.farePlusTip(tip);
    }).on('focus', function(event) {
        if (window.cordova && cordova.plugins && cordova.plugins.SoftKeyboard) {
            window.android = true;
            $('#main').css('height', $('#main').height());
            cordova.plugins.SoftKeyboard.show();
            setTimeout(function() { 
                delete window.android;
            }, 400);
        }
    }).on('blur', function(event) {
        if (window.cordova && cordova.plugins && cordova.plugins.SoftKeyboard) {
            window.android = true;
            cordova.plugins.SoftKeyboard.hide();
            setTimeout(function() { 
                $('#main').css('height', '');
                delete window.android;
            }, 400);
        }
    }).payment('restrictNumeric');
    
    $('#invite-link').on('blur', function(event) {
        var $this = $(this);
        $this.val($this.attr('data-url'));
    });

    // Trigger resize event to give everything the correct placement.
    $(window).resize();

    // Phonegap
    if (window.cordova) {
        document.addEventListener('deviceready', function() {
            profile.populate();
            TwilioHandlers();
            document.addEventListener('backbutton', onBackKeyDown, false);
            document.addEventListener('pause', onPause, false);
            document.addEventListener('resume', onResume, false);
            // Android hack for softkeyboard covering divs
            if (device.platform == 'Android') {
                $('#signup').css('height', window.innerHeight);
            }
        }, false);
    }
    // Web
    else {
        $.ajaxSetup({ cache: true });
        $.getScript('https://connect.facebook.net/en_US/sdk.js', function(){
            FB.init({
                appId: '667802789972584',
                version: 'v2.0'
            });
            FB.getLoginStatus(function() {
                profile.populate();
            });
        });
        $.getScript('https://static.twilio.com/libs/twiliojs/1.2/twilio.min.js', TwilioHandlers);
    }

    if (window.navigator && window.navigator.standalone) {
        changeScreen(window.localStorage.getItem('screen') || 'main', true);
    }
});

function onPause() {
    // Turn off geolocation to save power
    if (!driver && !rideOffers.driverID) {
        navigator.geolocation.clearWatch(watchID);
        watchID = false;
        if (window.confirmPosition) {
            confirmPosition();
            map.setCenter(me.getPosition());
        }
        // Clear marker of current position (in order to pinpoint location when resuming the app)
         if (!route && typeof(window.requestRide) !== 'function') {
            me.setMap();
            me = false;
            geo.active = startApp = true;
        }
        onPause.time = Date.now();
    }
}
function onResume() {
    var time = Date.now();
    // Clear dropoff position if app was paused for more than 30 minutes
    if (time - onPause.time > 1800000 && drop && !route) {
        drop.setMap();
        drop = false;
    }
    // Turn on geolocation
    if (!watchID) initialize();
}
function onBackKeyDown() {
    if ($('.screen').filter(':visible').offset().left == 200) {
        toggleMenu();
    }
    else if ($('#main').is(':visible')) {
        if ($('.collapse').is(':visible')) {
            $('.collapse').click();
        }
        else {
            navigator.app.exitApp();
        }
    }
    else {
        changeScreen('main', true);
    }
}

function TwilioHandlers() {
    Twilio.Device.ready(function() {
        $('.header').append('<button class="call"><i class="fa fa-phone"></i></button>');
    });
    Twilio.Device.error(function(error) {
        console.log(error);
    });
    Twilio.Device.offline(function() {
        Twilio.Device.disconnectAll();
        $('.call').remove();
    });
    Twilio.Device.incoming(function (conn) {
        if (window.cordova) {
            // Perhaps only send on iOS since Android seems to pop open the app when there's a call?
            window.plugin.notification.local.add({
                message: 'Incoming call...',
                date: new Date(),
                autoCancel: true
            });
            window.plugin.notification.local.hasPermission(function(granted) {
                if (!granted) window.plugin.notification.local.promptForPermission();
            });
        }
        customDialog.phone(conn);
        $('#modal').fadeIn();
    });
    Twilio.Device.disconnect(function (conn) {
        customDialog.phone.hangup();
        if (driver && $('#arrived-Pick-up').is(':visible')) {
            if (timer.waitOrDropRide) {
                clearInterval(timer.waitOrDropRide);
            }
            timer.waitOrDropRide = setInterval(function(){
                customDialog.setup('You\'ve been waiting for a while.', 'Keep Waiting', 'Cancel Ride', function() {
                    socket.emit('dropRide', rideRequests.current.rider);
                    rideRequests.cancelRequest(rideRequests.current.rider);
                });
            }, 300000);
        }
    });
}

var profile = {
    login: function() {
        if (window.facebookConnectPlugin) {
            if (window.navigator && window.navigator.standalone) {
                var url = 'https://www.facebook.com/dialog/oauth';
                url += '?client_id=667802789972584';
                url += '&redirect_uri=' + document.location.href;
                url += '&scope=public_profile,email';
                window.open(url, '', null);
            }
            else {
                facebookConnectPlugin.login(['public_profile','email'], profile.populate, function(error) { console.log(error); });
            }
        }
    },
    provePhone: function() {
        if (window.localStorage && window.localStorage.getItem) {
            var phone = window.localStorage.getItem('phone');
            var proof = window.localStorage.getItem('proof');
            if (phone && proof) {
                socket.emit('provePhone', {
                    phone: phone,
                    proof: proof
                });
            }
        }
    },
    populate: function() {
        if (window.facebookConnectPlugin) {
            facebookConnectPlugin.getAccessToken(function(token) {
                facebookConnectPlugin.api('/me', [], function(response) {
                    $('.fa-user').next().html(response.name);
                    $('.fa-envelope').next().html(response.email);
                    $('#profile-pic img').attr('src', 'https://graph.facebook.com/' + response.id + '/picture?type=large');
                    $('.screen-login').hide();
                    $('#profile-container,#payment-info,#earnings-info').show();
                    /* populate signup *
                    var $signup = $('#signup-form');
                    $signup.find('[name="firstName"]').val(response.first_name);
                    $signup.find('[name="lastName"]').val(response.last_name);
                    $signup.find('[name="email"]').val(response.email);
                    /**/
                }, function(error) {
                    console.log(error);
                });
                if (window.io && window.socket) socket.emit('login', token);
            }, function(error) {
                console.log(error);
            });
        }
    },
    logout: function() {
        function onsuccess() {
            $('.screen-login').show();
            $('#profile-container,#payment-info,#earnings-info').hide();
            $('.payment-cc').remove();
            socket.emit('logout');
            $('#toggleDriver').attr('id','becomeDriver').html('Become a Sqirl');
            hibernateDriver();
        }
        function onerror(error) {
            console.log(error);
        }
        if ($('#profile-phone').is(':visible') && !$('#profile-info').is(':visible')) {
            onsuccess();
            $('#profile-container').find('*').css('display','');
            window.localStorage.removeItem('phone');
            window.localStorage.removeItem('proof');
        }
        else if (window.facebookConnectPlugin) {
            facebookConnectPlugin.logout(onsuccess, onerror);
        }
    }
}

function trueCenterIcon(obj) {
    var $center = $('#center_icon');
    var $map = $('#map-canvas');
    $center.css({ 
        'top': $map.offset().top + $map.height()*0.5 - $center.height(),
        'left': $map.width()*0.5 - $center.width()*0.5
    }).show();
    if (obj) {
        $center.css('background-image', 'url("' + obj.getIcon().url + '")');
        obj.setVisible(false);
    }
}

function easyGPS() {
    //$('#map-canvas').append('<button class="gps"><i class="fa fa-crosshairs"></i></button>');
    $('#main .header').append('<button class="gps"><i class="fa fa-location-arrow"></i><button>');
    $('.gps').on('click', function(event) {
        var $this = $(this);
        if (geo.latitude && geo.longitude) {
            map.panTo(new google.maps.LatLng(geo.latitude, geo.longitude));
        }
        else {
            console.log('GPS is currently inactive.');
        }
        $this.hide();
        google.maps.event.addListenerOnce(map, 'center_changed', function() {
            $this.show();
        });
    });
}

/**
$(document).ready(function() {
    $('[name="carMake"]').on('input', function(event) {
        freebase.suggestMake(this.value);
    });
    $('[name="carModel"]').on('input', function(event) {
        freebase.suggestModel(this.value, $('[name="carMake"]').val());
    });
});
/**/
var freebase = {
    suggestMake: function(makeInput) {
        var service_url = 'https://www.googleapis.com/freebase/v1/search';
        var params = {
            'query': makeInput,
            'type': '/base/cars_refactor/make',
            'prefixed': true,
            'limit': 5
        };
        $.getJSON(service_url + '?callback=?', params, function(response) {
            console.log('---');
            $.each(response.result, function(i, make) {
                //console.log(make);
                console.log(make.name);
            });
        });
    },
    suggestModel: function(modelInput, makeInput) {
        var service_url = 'https://www.googleapis.com/freebase/v1/mqlread';
        var query = [{
            'name': null,
            'type': '/base/cars_refactor/model',
            'name~=': modelInput + '*',
            'make': [{
                'name': null,
                'name~=': makeInput
            }],
            'limit': 5
        }];
        $.getJSON(service_url + '?callback=?', {query:JSON.stringify(query)}, function(response) {
            console.log('---');
            $.each(response.result, function(i, model) {
                var modelName = model.name;
                for (var i=0, l = model.make.length; i<l; ++i) {
                    modelName = modelName.replace(model.make[i].name,'');
                }
                modelName = modelName.replace(/^ /,'');
                //console.log(model);
                console.log(modelName);
            });
        });
    }
}


function hibernateDriver() {
    rideRequests.hideRequest();
    rideRequests.queue = [];
    $('#main-footer').css('bottom','-120px').show().stop().animate({'bottom': '0px'}, { 
        progress: function() { 
            $('#map-canvas').css('height',window.innerHeight - 44 - parseInt($('#main-footer').css('bottom'),10) - 120);
        },
        complete: function() {
            $('#main-footer').css('bottom','');
            driver = false;
        }
    });
    me.setIcon({
        url: 'img/markers/dropoffAcorn.png',
        scaledSize: new google.maps.Size(25,30)
    });
    $('#checkEarnings').html('Payment').attr('id','makePayment');
    $('#map-canvas').css('height', window.innerHeight - 164);
    google.maps.event.trigger(map, 'resize');
    editPosition();
    google.maps.event.removeListener(drivingListener);
    drivingListener = false;
    socket.emit('hibernateDriver');
    $('#toggleDriver').html('Active Sqirl');
}
function activateDriver() {
    $('#cancelRequest').click();
    if (window.confirmPosition) confirmPosition();
    if (drop) {
        drop.setMap();
        drop = false;
    }
    geo.active = true;
    $('#main-footer').stop().animate({'bottom': '-120px'}, { 
        progress: function() { 
            $('#map-canvas').css('height',window.innerHeight - 44 - parseInt($('#main-footer').css('bottom'),10) - 120);
        },
        complete: function() {
            $('#main-footer').hide();
            driver = true;
        }
    });
    me.setIcon({
        url: 'img/markers/enrouteSqirl.png',
        scaledSize: new google.maps.Size(51,38)//(57,36)
    });
    $('#makePayment').html('Earnings').attr('id','checkEarnings');
    //$('#driver-footer').show();
    socket.emit('activateDriver');
    emitPositionUpdates();
    google.maps.event.trigger(me, 'position_changed');
    $('#toggleDriver').html('Hibernate Sqirl');
}
function emitPositionUpdates(obj) {
    if (!obj) obj = me;
    if (!drivingListener) {
        drivingListener = google.maps.event.addListener(obj, 'position_changed', function() {
            var spot = obj.getPosition();
            // Calculate distance endpoints are "off road" in getRoute() and add that to a proximity threshold
            
            if (pickup && $('#offerAccepted').is(':visible') && getDistance(pickup.getPosition(),spot) < 25 + pickup.offroad) {
                console.log('Arrived at Pick-up!');
                $('#offerAccepted,.getDirections').hide();
                $('#arrived-Pick-up,.startRide').show();
            }
            if (pickup && $('#drive-in-progress').is(':visible')) {
                pickup.setPosition(me.getPosition());
            }
            if (dropoff && $('#drive-in-progress').is(':visible') && getDistance(dropoff.getPosition(),spot) < 25 + dropoff.offroad) {
                console.log('Arrived at Drop-off!');
                $('#drive-in-progress,.getDirections').hide();
                $('#arrived-Drop-off,.finishRide').show();
            }
            if (window.io && window.socket) socket.emit('update', [spot.lat(), spot.lng()]);
            if (rideRequests.last_point && rideRequests.rideInProgress) {
                rideRequests.measured_distance += getDistance(spot, rideRequests.last_point);
                rideRequests.last_point = spot;
            }
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

function changeScreen(newScreenID, quick) {
    var $oldScreen = $('.screen').filter(':visible');
    var $newScreen = $('#' + newScreenID);
    var left = Math.round($oldScreen.offset().left);
    if ([0,200].indexOf(left) == -1) {
        return false;
    }
    if (!$oldScreen.is($newScreen)) {
        $newScreen.css('left', left + 'px');
        $newScreen.show();
        $oldScreen.hide();
    }
    $(window).resize();
    if (!quick) toggleMenu();
    if (window.navigator && window.navigator.standalone) {
        window.localStorage.setItem('screen',newScreenID);	
    }
}

function toggleMenu() {
    var $sidebar = $('#sidebar');
    var $screen = $('.screen').filter(':visible');
    var left = Math.round($screen.offset().left);
    switch (left) {
            case 0:
                $screen.animate({'left':$sidebar.width()});
                $sidebar.animate({'left':''});
                break;
            case 200:
                $screen.animate({'left':''});
                $sidebar.animate({'left':-$sidebar.width()});
                break;
            default:
                // do nothing
                break;
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
            if ($('#requestRide').is(':visible')) $('#main-footer input').filter(':visible').val(address);
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
    if ($input.offset().top > window.innerHeight * 0.1) {
        confirmPosition(1);
        if (!window.autocomplete) {
            autocomplete = new google.maps.places.AutocompleteService();
        }
        $input.css({'height': $input.height()}).stop().animate({'top': '1%', 'left': '2%', 'width': '88%'}, {
            progress: function() {
                $(window).scrollTop(0);
            },
            complete: function() { 
                $input.removeAttr('readonly');
                setTimeout(function() {
                    $input.attr('placeholder',$input.val());
                    $input.val('');
                    $input.select()/*[0].setSelectionRange(0,9999)*/;
                    if (window.cordova && cordova.plugins && cordova.plugins.SoftKeyboard) {
                        cordova.plugins.SoftKeyboard.show();
                    }
                }, 10);
                $('.clear,.collapse').show();
            }
        });
        $('#main-footer').stop().animate({'height': '100%'}).children().not($input).hide();
        return true;
    }
}
function small_input(callback) {
    var $input = $('#main-footer input').filter(':visible');
    $input.blur().attr('readonly','readonly');
    var android = window.cordova && cordova.plugins && cordova.plugins.SoftKeyboard;
    if (android) {
        cordova.plugins.SoftKeyboard.hide();
    }
    $('#main-footer ul').remove();
    $('.clear,.collapse').hide();
    if ($input.offset().top < window.innerHeight * 0.1) {
        $input.stop().animate({
            'top': ($input.hasClass('Pick-up') ? '8.33%' : '54.17%'),
            'width': '52%', 
            'left': '5%',
            'height': '45px'
        });
        $('#main-footer').stop().animate({'height': '120px'}, function() {
            $input.css({'top': '', 'left': '', 'width': '', 'height': ''});
            $('.Change' + ($input.hasClass('Drop-off') ? '.Pick-up' : '.Drop-off') + ',#requestRide').show();
            if (android) editPosition($input.hasClass('Drop-off'));
            if (typeof(callback) === 'function') callback();
        });
        if (!android) editPosition($input.hasClass('Drop-off'));
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

function rad(degree) {
    return degree * Math.PI / 180;	
}

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

function statusMessage(message) {
    var $status = $('.screen').filter(':visible').find('.status-message');
    $status.html(message).fadeIn();
    if (timer.statusMessage) {
        clearTimeout(timer.statusMessage);
    }
    timer.statusMessage = setTimeout(function() {
        $status.fadeOut();
    }, 2000);
}
statusMessage.car = function(picture, height, width) {
    var $status = $('.status-message');
    $status.attr({
        'data-pic': picture
    });
    statusMessage.show = function() {
        var $status = $('.screen').filter(':visible').find('.status-message');
        $status.html('<span>Look for this vehicle.</span>').append($('<img>', {
            src: $status.attr('data-pic')
        })).addClass('showing-car').fadeIn();
    };
    statusMessage.hide = function() {
        var $status = $('.screen').filter(':visible').find('.status-message');
        $status.fadeOut(function() {
            $status.removeClass('showing-car');
        });
    };
};

var customDialog = {
    phone: function(conn) {
        $('#modal').addClass('phone').removeClass('connected');
        var person = driver ? 'rider' : 'Sqirl';
        this.setup('Incoming call from ' + person, '<i class="fa fa-phone"></i><br><span>Decline</span>', '<i class="fa fa-phone"></i><br><span>Answer</span>');
        
        this.phone.call = function() {
            $('#modal').addClass('connected');
            $('#popup p').html('Calling ' + person);
            $('#popup-cancel span').html('Hangup');
        };
        this.phone.talking = function() {
            $('#popup p').html('Talking to ' + person);
        };
        this.phone.answer = function() {
            $('#popup-cancel,#popup-confirm').css('transition','all 0.4s ease');
            $('#modal').addClass('connected');
            $('#popup p').html('Talking to ' + person);
            $('#popup-cancel span').html('Hangup');
            
            if (conn && conn.accept) conn.accept();
        };
        this.phone.hangup = function() {
            if ($('.phone#modal').hasClass('connected')) {
                Twilio.Device.disconnectAll();
            }
            else if (conn && conn.reject) {
                conn.reject();
            }
            $('#popup-cancel,#popup-confirm').css('transition','')
                .off('click', this.answer)
                .off('click', this.hangup);
            $('#modal').fadeOut();
        };
        $('#popup-confirm').one('click', this.phone.answer);
        $('#popup-cancel').one('click', this.phone.hangup);
        
        return this.phone;
    },
    cost: function(cost) {
        $('#modal').removeClass('phone connected');
        this.setup('This trip will cost $' + cost, 'Cancel', 'OK', function() {
            rideOffers.acceptOffer();
        });
    },
    endtrip: function() {
        $('#modal').removeClass('phone connected');
        this.setup('This action will end your trip.', 'Cancel', 'OK', function() {
            rideOffers.endRide();
        });
    },
    setup: function(msg, cancel, ok, onwin) {
        $('#popup p').html(msg);
        $('#popup-cancel').html(cancel);
        $('#popup-confirm').html(ok);
        
        this.fnCancel = function() {
            $('#popup-cancel,#popup-confirm')
                .off('click', this.confirm)
                .off('click', this.cancel);
            $('#modal').fadeOut(100);
        };
        this.fnConfirm = function() {
            if (typeof onwin === 'function') {
                onwin();
            }
            customDialog.fnCancel();
        };
        $('#popup-confirm').one('click', this.fnConfirm);
        $('#popup-cancel').one('click', this.fnCancel);
    }
};

function handleOpenURL(url) {
    console.log('received url:', url);
    var parser = $('<a>', { href: url })[0];
    var params = handleOpenURL.queryToJSON(parser);
    console.log('params:', params);
    if (params['pickup[longitude]'] && params['pickup[latitude]']) {
        var lat = parseFloat(params['pickup[latitude]']);
        var lng = parseFloat(params['pickup[longitude]']);
        draw(0, lat, lng);
    }
    if (params['dropoff[longitude]'] && params['dropoff[latitude]']) {
        var lat = parseFloat(params['dropoff[latitude]']);
        var lng = parseFloat(params['dropoff[longitude]']);
        draw(-1, lat, lng);
    }
    if (params['request'] == 'true') {
        connect();
        startApp = false;
        $(document).ready(function() {
            document.addEventListener('deviceready', function() {
                if (Object.keys(cars).length == 0) {
                    window.requestRide = function() {
                        $('#requestRide').click();
                    };
                    facebookConnectPlugin.getAccessToken(null, requestRide);
                }
                else {
                    $('#requestRide').click();
                }
            }, false);
        });
    }
}
handleOpenURL.queryToJSON = function(parser) {
    if (parser && parser.search) {
        var pairs = parser.search.slice(1).split('&');
        var result = {};
        pairs.forEach(function(pair) {
            pair = pair.split('=');
            result[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || '');
        });
        return JSON.parse(JSON.stringify(result));
    }
    return {};
}
handleOpenURL.makeURL = function(LatLng) {
    var url = 'ridesqirl://';
    if (LatLng) {
        var p1 = me.getPosition();
        url += '?pickup[latitude]=' + p1.lat();
        url += '&pickup[longitude]=' + p1.lng();
        if (drop) {
            var p2 = drop.getPosition();
            url += '&dropoff[latitude]=' + p2.lat();
            url += '&dropoff[longitude]=' + p2.lng();
        }
    }
    return url;
}
