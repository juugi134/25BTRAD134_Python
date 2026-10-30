
#Lab exercise 2- Write and execute a basic Python program.
print("Hello World")
print("Python Programming")


# Lab Exercise 3- Programs using variables, operators and input/output

a = int(input("Enter first number: "))
b = int(input("Enter second number: "))

sum = a + b
difference = a - b
product = a * b
division = a / b
modulus=a%b

print("Sum is:", sum)
print("Difference:", difference)
print("Product:", product)
print("Division:", division)
print("Modulus",modulus)

# Lab Exercise 4
# Simple calculator and area calculation programs
a = float(input("Enter first number: "))
b = float(input("Enter second number: "))
print("\n Calculator")
print("Addition:", a + b)
print("Subtraction:", a - b)
print("Multiplication:", a * b)
if b != 0:
    print("Division:", a / b)
else:
    print("Cannot divide by zero")
#areas
radius = float(input("\nEnter radius of circle: "))

circle_area = 3.14 * radius * radius
print("Area of Circle:", circle_area)

length = float(input("\nEnter length of rectangle: "))
width = float(input("Enter width of rectangle: "))
rectangle_area = length * width
print("Area of Rectangle:", rectangle_area)


# Lab Exercise 5 - Number Guessing Game

number = 7
while True:
    guess = int(input("Enter a number (1-10): "))

    if guess == number:
        print("You guessed the correct number.")
        break
    elif guess < number:
        print("Too low! Try again.")
    else:
        print("Too high! Try again.")

    
# Lab Exercise 6 - Prime Number and Factorial programs

num = int(input("Enter a number: "))

if num <= 1:
    print("Not a prime number.")
else:
    for i in range(2, num):
        if num % i == 0:
            print("Not a prime number.")
            break
    else:
        print("Prime number.")

factorial = 1

for i in range(1, num + 1):
    factorial = factorial * i

print("Factorial =", factorial)

# Lab Exercise 7 - Fibonacci Series Using Recursion

def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

num = int(input("Enter number of terms: "))

for i in range(num):
    print(fibonacci(i), end=" ")




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


#Task 1
print("Fathima")
print("Department: CSE AIDE B")
print("College: Jain")


#Lab exercise 1- Setting Up VS Code
print("Hello World!")


