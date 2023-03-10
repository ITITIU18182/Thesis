# Polynomial evaluation and Lagrange interpolation
#
# unoptimized

from bandersnatch import Scalar, Point, ScalarVector, PointVector
import bandersnatch


# list of powers of x: [x ** 0, x ** 1, x ** 2, ..., x ** degree]
#    * x: Scalar
#    * degree: int
def powers(x: Scalar, degree: int) -> ScalarVector:
    powers_x = ScalarVector()
    for i in range(degree + 1):
        powers_x.append(x ** i)
    return powers_x


# polynomial evaluation poly_eval(x)
#    * coeff: ScalarVector of coefficients
def poly_eval(x: Scalar, coeff: ScalarVector) -> Scalar:
    degree = len(coeff) - 1
    return powers(x, degree) ** coeff


# polynomial multiplication
#    * poly_a: ScalarVector of polynomial 'a'
#    * poly_b: ScalarVector of polynomial 'b'
def poly_mul(poly_a: ScalarVector, poly_b: ScalarVector) -> ScalarVector:
    prod = [Scalar(0) for i in range(len(poly_a) + len(poly_b) - 1)]
    for i in range(len(poly_a)):
        for j in range(len(poly_b)):
            prod[i + j] += poly_a[i] * poly_b[j]
    return ScalarVector(prod)


# Lagrange interpolation
#    * coords: list of coordinates (in Scalar)
def lagrange(coords: list) -> ScalarVector:
    poly = ScalarVector([Scalar(0) for i in range(len(coords))])
    for i in range(len(coords)):
        basis = ScalarVector([Scalar(1)])
        for j in range(len(coords)):
            if j == i:
                continue
            basis = poly_mul(basis, ScalarVector([-coords[j][0], Scalar(1)]))
            basis *= (coords[i][0] - coords[j][0]).invert()
        poly += basis * coords[i][1]
    return poly


if __name__ == '__main__':
    my_points = [(Scalar(-1), bandersnatch.random_scalar()),
                (Scalar(0), bandersnatch.random_scalar()),
                (Scalar(1), bandersnatch.random_scalar())]
    my_coeffs = lagrange(my_points)

    # test
    passed = True
    for i in my_points:
        passed &= (poly_eval(i[0], my_coeffs) == i[1])
    if passed:
        print('The implementation of Lagrange interpolation works!')
    else:
        print('There\'s a problem in the implementation of Lagrange interpolation.')