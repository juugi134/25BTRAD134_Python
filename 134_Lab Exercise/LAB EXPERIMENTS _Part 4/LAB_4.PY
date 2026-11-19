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


