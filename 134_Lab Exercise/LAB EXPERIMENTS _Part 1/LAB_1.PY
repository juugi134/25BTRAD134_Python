
#Lab exercise 1- Setting Up VS Code
# #Lab Exercise 1: Installing Python, Setting up VS Code / PyCharm, Jupyter Notebook
# Using VS Code
# 1. Open the official website: https://code.visualstudio.com/ 
# 2. Download VS Code for your operating system.
# 3. Run the installer and complete the installation.
# 4. Open Visual Studio Code.
# 5. Click the Extensions icon in the left sidebar.
# 6. Search for Python and install the extension by Microsoft.
# 7. Press Ctrl + Shift + P to open the Command Palette.
# 8. Search for Python: Select Interpreter.
# 9. Select the installed Python version.
# 10. Click File → Open Folder and create or select a folder for your Python programs.
# 11. Click New File and create a file named hello.py.
# 12. Type the following code:
# print("Hello, World!")
# 13. Save the file using Ctrl + S.
# 14. Click the Run Python File button in the upper-right corner.
# 15. Check the output in the terminal. If Hello, World! appears, VS Code is set up successfully.
print("Hello World!")

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


