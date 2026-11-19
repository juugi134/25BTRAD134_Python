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
