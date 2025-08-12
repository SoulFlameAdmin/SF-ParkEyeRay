from send_sms import send_sms
from generate_code import generate_code

if __name__ == "__main__":
    phone_number = input("Въведете телефонен номер: ")
    code = generate_code()
    send_sms(phone_number, code)
