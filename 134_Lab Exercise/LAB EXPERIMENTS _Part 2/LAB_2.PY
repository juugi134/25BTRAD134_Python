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
