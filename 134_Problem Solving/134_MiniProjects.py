# Mini Project 1 - Unit Converter
print("\n 1. km to m")
print("2. m to km")
print("3. Kg to g")
print("4. g to Kg")
print("5. cm to m")
print("6. cm to mm")
print("7. m to mm")
print("8. mm to m")


choice = int(input("Enter choice: "))
value = float(input("Enter value: "))

if choice == 1:
    print("Result =", value * 1000, "m")
elif choice == 2:
    print("Result =", value / 1000, "km")
elif choice == 3:
    print("Result =", value * 1000, "g")
elif choice == 4:
    print("Result =", value / 1000, "Kg")
elif choice == 5:
    print("Result =", value / 100, "m")
elif choice == 6:
    print("Result =", value * 10, "mm")
elif choice == 7:
    print("Result =", value * 1000, "mm")
elif choice == 8:
    print("Result =", value / 1000, "m")
else:
    print("Invalid choice")
#Mini project 2 - Student grade automation
marks=[]
for i in range(1,4):
    mark=float(input(f"Enter marks for Subject{i}:"))
    marks.append(mark)
total = marks[0] + marks[1] + marks[2]

print("The total marks is:",total)
percentage=total/3
print("The percentage is:",percentage)
if percentage>=90:
    grade="O"
elif percentage>=80:
    grade="A+"
elif percentage>=70:
    grade="A"
elif percentage>=60:
    grade="B"
else:
    grade="Below B"
print("Final Grade:",grade)
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