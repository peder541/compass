Stripe.setPublishableKey('pk_test_KMjrAlhOj5o00CE98bvhCuNG');

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