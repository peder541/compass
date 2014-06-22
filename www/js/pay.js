Stripe.setPublishableKey('pk_test_KMjrAlhOj5o00CE98bvhCuNG');

$(document).ready(function() {
	$('.cc-number').payment('formatCardNumber');
	$('.cc-exp').payment('formatCardExpiry');
	$('.cc-cvc').payment('formatCardCVC');
	
	$('form').on('submit', function(event) {
		var $form = $('form');
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
	$('#cancel').on('click', function(event) {
		window.top.$('iframe').fadeOut({
			complete: function() {
				window.top.$('iframe').remove();	
			}
		});
	});
});

function stripeResponse(status, response) {
	if (response.error) {
		console.log('Error', response.error.message);
		$('form button').prop('disabled', false);
	}
	else {
		console.log('Success');
		var $form = $('form');
		var token = response['id'];
		console.log(token);
		$form.append("<input type='hidden' name='stripeToken' value='" + token + "' />");
		$form[0].submit();
	}
}