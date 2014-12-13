// Dev Mode
Stripe.setPublishableKey('pk_test_KMjrAlhOj5o00CE98bvhCuNG');
// Production
//Stripe.setPublishableKey('pk_live_oQDihB7XawJZRgmQMHbUf2de');

$(document).ready(function() {
	$('.cc-number').payment('formatCardNumber');
	$('.cc-exp').payment('formatCardExpiry');
	$('.cc-cvc').payment('formatCardCVC');
    
    $('.routing-number,.account-number').payment('restrictNumeric');
	
	$('#credit-card-info').on('submit', function(event) {
		var $form = $('#credit-card-info');
		$form.find('button').prop('disabled', true);
		var expiry = $('.cc-exp').payment('cardExpiryVal');
		Stripe.card.createToken({
			number: $('.cc-number').val(),
			cvc: $('.cc-cvc').val(),
			exp_month: expiry.month,
			exp_year: expiry.year
		}, stripeResponse);
		return false;
	});
	
	$('label').has('#slider').on('click', function(event) {
		var $slider = $('#slider');
		if ($slider.hasClass('checked')) $slider.removeClass('checked');
		else $slider.addClass('checked');
	});
	$('.cancel').on('click', function(event) {
		if (window.top.rideOffers.acceptOffer) {
			delete window.top.rideOffers.acceptOffer;	
		}
		window.top.$('#credit-card').fadeOut({
			complete: function() {
				window.top.$('#credit-card-info input').val('').filter('.cc-number').attr('class','cc-number');	
				window.top.$('#credit-card-info button').prop('disabled', false).filter('[type="submit"]').attr('class','multi-use');
			}
		});
	});
});

function stripeResponse(status, response) {
	if (response.error) {
		console.log('Error', response.error.message);
        var $declined = $('.declined-card');
        $declined.children('.declined-card-reason').html(response.error.message);
        $declined.fadeIn();
        setTimeout(function() {
            $declined.fadeOut();
        }, 1400);
		$('#credit-card-info button').prop('disabled', false);
	}
	else {
		console.log('Success');
		var token = response.id;
		if (window.top.rideOffers && window.top.rideOffers.acceptOffer) {
			window.top.rideOffers.acceptOffer(token);	
		}
		else if (window.top.socket) {
			window.top.socket.emit('saveCard', {
				token: token
			});
		}
		else {
			//var $form = $('form');
			console.log(token);
			//$form.append("<input type='hidden' name='stripeToken' value='" + token + "' />");
			//$form[0].submit();
		}
	}
}

// JavaScript Document

$(document).ready(function() {
	
	$('input[name="phone"]').payment('restrictNumeric').on('keypress', formatPhoneNumber).on('keydown', formatBackWithDashes);
	
    $('input[name="ssn"]').payment('restrictNumeric').on('keypress', formatSSN).on('keydown', formatBackWithDashes);
    
    $('input[name="dob"]').payment('restrictNumeric').on('keypress', formatDOB).on('keydown', formatBackWithDashes);
    
    $('input[name="carYear"]').payment('restrictNumeric').on('keypress', function(event) { return restrictNumericLength(event,4); });
    
    $('input[name="zipcode"]').payment('restrictNumeric').on('keypress', function(event) { return restrictNumericLength(event,5); });
    
    $('input[name="code"]').payment('restrictNumeric').on('keypress', function(event) { return restrictNumericLength(event,6); });
    
});

function restrictNumericLength(event, maxlength) {
	var $target, digit, value;
	$target = $(event.currentTarget);
	digit = String.fromCharCode(event.which);
	if (!/^\d+$/.test(digit)) {
		return;
	}
	if (hasTextSelected($target)) {
		return;
	}
	value = $target.val() + digit;
	value = value.replace(/\D/g, '');
	if (value.length > maxlength) {
		return false;
	}
}
function hasTextSelected($target) {
	var _ref;
	if (($target.prop('selectionStart') != null) && $target.prop('selectionStart') !== $target.prop('selectionEnd')) {
		return true;
	}
	if (typeof document !== "undefined" && document !== null ? (_ref = document.selection) != null ? typeof _ref.createRange === "function" ? _ref.createRange().text : void 0 : void 0 : void 0) {
		return true;
	}
	return false;
}
function formatPhoneNumber(event) {
    if (restrictNumericLength(event, 10) === false) return false;
    formatWithDashes(event, [3,6]);
}
function formatSSN(event) {
    if (restrictNumericLength(event, 9) === false) return false;
    formatWithDashes(event, [3,5]);
}
function formatDOB(event) {
    var $target, digit, val;
    digit = String.fromCharCode(event.which);
    $target = $(event.currentTarget);
    val = $target.val();
    if ((val.length == 5 && digit > 1) || (val.length == 8 && digit > 3)) {
        $target.val(val + '0');
    }
    if (restrictNumericLength(event, 8) === false) return false;
    formatWithDashes(event, [4,6]);
}
function formatWithDashes(event, dashesArray, withSlashes) {
	var $target, digit, val, index, num, length, dash, lastDash, dashChar;
    dashChar = (withSlashes) ? '/' : '-';
	digit = String.fromCharCode(event.which);
	if (!/^\d+$/.test(digit)) {
		return;
	}
	$target = $(event.currentTarget);
	if (hasTextSelected($target)) {
		return;
	}
	val = $target.val();
	index = $target.prop('selectionStart');
	if (index || index === 0) {
		if (index != val.length) {
			var dif = val.length - index;
			var timer = setTimeout(function() {
				var spot = val.length - dif;
				if (val[spot] == dashChar) spot += 1;
				$target.prop('selectionStart', spot);
				$target.prop('selectionEnd', spot);		
			}, 0);
		}
		val = val.slice(0,index) + digit + val.slice(index);
	}
	else {
		val = val + digit;
	}
	num = val.replace(/\D/g, '');
	length = num.length;
	dash = val.indexOf(dashChar);
	lastDash = val.lastIndexOf(dashChar);
	if (dash != dashesArray[0] || (lastDash != dash && lastDash != dashesArray[1] + 1)) {
		val = num.slice(0,dashesArray[0]);
		if (length >= dashesArray[0]) {
			val += dashChar + num.slice(dashesArray[0], dashesArray[1]);	
		}
		if (length >= dashesArray[1]) {
			val += dashChar + num.slice(dashesArray[1]);	
		}
		event.preventDefault();
		return $target.val(val);
	}
	else if (length == dashesArray[0] || length == dashesArray[1]) {
		event.preventDefault();
		return $target.val(val + dashChar);
	}
}
function formatBackWithDashes(event) {
	var $target, value;
	if (event.meta) {
		return;
	}
	$target = $(event.currentTarget);
	value = $target.val();
	if (event.which !== 8) {
		return;
	}
	if (($target.prop('selectionStart') != null) && $target.prop('selectionStart') !== value.length) {
		return;
	}
	if (/\d(\s|\-)+$/.test(value)) {
		event.preventDefault();
		return $target.val(value.replace(/\d(\s|\-|\/)*$/, ''));
	}
	else if (/\s\-\s?\d?$/.test(value)) {
		event.preventDefault();
        console.log('Rarely (if ever) triggered...');
		return $target.val(value.replace(/\s\-\s?\d?$/, ''));
	}
}

