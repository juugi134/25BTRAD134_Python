#Lab Exercise 8: Contact book using lists and dictionaries

contacts = {}

while True:
    print("\n1.Add Contact")
    print("2.Search Contact")
    print("3.Update Contact")
    print("4.Delete Contact")
    print("5.Display Contacts")
    print("6.Exit")

    choice = int(input("Enter choice: "))

    if choice == 1:
        name = input("Enter name: ")
        phone = input("Enter phone number: ")
        contacts[name] = phone
        print("Contact added successfully")

    elif choice == 2:
        name = input("Enter name to search: ")
        if name in contacts:
            print("Phone:", contacts[name])
        else:
            print("Contact not found")

    elif choice == 3:
        name = input("Enter name to update: ")
        if name in contacts:
            contacts[name] = input("Enter new phone: ")
            print("Contact updated")
        else:
            print("Contact not found")

    elif choice == 4:
        name = input("Enter name to delete: ")
        if name in contacts:
            del contacts[name]
            print("Contact deleted")
        else:
            print("Contact not found")

    elif choice == 5:
        for name, phone in contacts.items():
            print(name, ":", phone)

    elif choice == 6:
        break

    else:
        print("Invalid choice")

#Lab Exercise 9-Student grading system
students = {}

n = int(input("Enter number of students: "))

for i in range(n):
    name = input("Enter student name: ")
    mark = int(input("Enter marks: "))
    students[name] = mark

print("\nStudent Results")

for name, mark in students.items():
    if mark >= 90:
        grade = "A"
    elif mark >= 80:
        grade = "B"
    elif mark >= 70:
        grade = "C"
    elif mark >= 50:
        grade = "D"
    else:
        grade = "F"

    print(name, mark, grade)

#Lab Exercise 10: Frequency counter using dictionaries

sentence = input("Enter a sentence: ")

words = sentence.lower().split()

frequency = {}

for word in words:
    if word in frequency:
        frequency[word] += 1
    else:
        frequency[word] = 1

print("\nWord Frequency")

for word, count in frequency.items():
    print(word, ":", count)

# Mini Project (UNIT 3) Problem solving component - 1. Attendance tracker
attendance = {}

n = int(input("Enter number of students: "))

for i in range(n):
    name = input("Enter student name: ")
    attendance[name] = []

days = int(input("Enter number of days: "))

for day in range(days):
    print("\nDay", day + 1)

    for name in attendance:
        status = input(name + " (P/A): ").upper()

        if status == "P":
            attendance[name].append(1)
        else:
            attendance[name].append(0)

print("\nAttendance Report")

for name, records in attendance.items():
    present = sum(records)
    percentage = (present / days) * 100

    print("Name:", name)
    print("Present:", present)
    print("Attendance:", percentage, "%")

    if percentage < 75:
        print("Low attendance")

#Lab Exercise 11: Log file reader program.
try:
    file = open("log.txt", "r")

    error = 0
    warning = 0
    info = 0

    for line in file:
        if "ERROR" in line:
            error += 1
        elif "WARNING" in line:
            warning += 1
        elif "INFO" in line:
            info += 1

    file.close()

    print("ERROR:", error)
    print("WARNING:", warning)
    print("INFO:", info)

except FileNotFoundError:
    print("Log file not found")

 #Lab Exercise 12: Student data manager using files.
 
while True:
    print("\n1.Add Student")
    print("2.Display Students")
    print("3.Search Student")
    print("4.Exit")

    choice = int(input("Enter choice: "))

    if choice == 1:
        name = input("Enter student name: ")
        roll = input("Enter roll number: ")

        with open("students.txt", "a") as file:
            file.write(name + "," + roll + "\n")

        print("Student added successfully")

    elif choice == 2:
        try:
            with open("students.txt", "r") as file:
                print(file.read())
        except FileNotFoundError:
            print("No records found")

    elif choice == 3:
        search = input("Enter roll number: ")
        found = False

        try:
            with open("students.txt", "r") as file:
                for line in file:
                    name, roll = line.strip().split(",")

                    if roll == search:
                        print("Name:", name)
                        print("Roll:", roll)
                        found = True

            if not found:
                print("Student not found")

        except FileNotFoundError:
            print("No records found")

    elif choice == 4:
        break

    else:
        print("Invalid choice")
Lab Exercise 13: CSV-based payroll management system

import csv

try:
    with open("employees.csv", "r") as file:
        reader = csv.DictReader(file)

        print("Employee Salary Report")

        for row in reader:
            name = row["Name"]
            basic = float(row["Basic"])
            allowance = float(row["Allowance"])

            gross = basic + allowance
            deduction = gross * 0.10
            net = gross - deduction

            print("\nEmployee:", name)
            print("Gross Salary:", gross)
            print("Deduction:", deduction)
            print("Net Salary:", net)

except FileNotFoundError:
    print("CSV file not found")


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
