import requests

def send_sms(phone_number, code):
    api_key = "YOUR_API_KEY"
    sender = "ParkingApp"
    message = f"Вашият код за потвърждение е: {code}"
    url = "https://api.twilio.com/send"

    payload = {
        "to": phone_number,
        "message": message,
        "sender": sender
    }

    print(f"SMS изпратено до {phone_number}: {message}")
    # В реално изпълнение тук ще бъде API заявка
    # requests.post(url, data=payload, headers={"Authorization": f"Bearer {api_key}"})
