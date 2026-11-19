#Lab Exercise 14: Bank account system using OOP
class BankAccount:

    def __init__(self, name, balance):
        self.name = name
        self.__balance = balance

    def deposit(self, amount):
        if amount > 0:
            self.__balance += amount
            print("Amount deposited successfully")
        else:
            print("Invalid amount")

    def withdraw(self, amount):
        if amount <= 0:
            print("Invalid amount")
        elif amount <= self.__balance:
            self.__balance -= amount
            print("Amount withdrawn successfully")
        else:
            print("Insufficient balance")

    def display(self):
        print("Account Holder:", self.name)
        print("Balance:", self.__balance)


account = BankAccount("abcd", 5000)

account.display()
account.deposit(2000)
account.withdraw(1000)
account.display()
#Lab Exercise 15: Library management system.
class Book:

    def __init__(self, title):
        self.title = title
        self.available = True

    def issue(self):
        if self.available:
            self.available = False
            print(self.title, "issued successfully")
        else:
            print(self.title, "is not available")

    def return_book(self):
        if not self.available:
            self.available = True
            print(self.title, "returned successfully")
        else:
            print(self.title, "was not issued")

    def display(self):
        print("Book:", self.title)
        print("Available:", self.available)


book1 = Book("Python Programming")

book1.display()
book1.issue()
book1.display()
book1.return_book()
book1.display()

#Lab Exercise 16: Dice simulator using random module.
import random

n = int(input("Enter number of dice rolls: "))

frequency = {}

for i in range(1, 7):
    frequency[i] = 0

for i in range(n):
    result = random.randint(1, 6)

    print("Roll", i + 1, ":", result)

    frequency[result] += 1

print("\nFrequency of Outcomes")

for number, count in frequency.items():
    print(number, ":", count)