from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poc3d.triangulate import triangulate


class TriangulateTest(unittest.TestCase):
    def test_triangule_un_polygone_concave(self) -> None:
        points = [(0, 0, 0), (3, 0, 0), (3, 3, 0), (1, 3, 0), (1, 1, 0), (0, 1, 0)]
        triangles = triangulate(points, [[0, 1, 2, 3, 4, 5]])
        self.assertEqual(len(triangles), 4)
        self.assertTrue(all(len(set(triangle)) == 3 for triangle in triangles))

    def test_triangule_un_polygone_avec_trou(self) -> None:
        points = [
            (0, 0, 0), (6, 0, 0), (6, 6, 0), (0, 6, 0),
            (2, 2, 0), (2, 4, 0), (4, 4, 0), (4, 2, 0),
        ]
        triangles = triangulate(points, [[0, 1, 2, 3], [4, 5, 6, 7]])
        self.assertEqual(len(triangles), 8)

    def test_accepte_des_sommets_colineaires(self) -> None:
        points = [(0, 0, 0), (1, 0, 0), (2, 0, 0), (2, 2, 0), (0, 2, 0)]
        self.assertEqual(len(triangulate(points, [[0, 1, 2, 3, 4]])), 3)

    def test_refuse_un_anneau_degenere(self) -> None:
        with self.assertRaises(ValueError):
            triangulate([(0, 0, 0), (1, 0, 0)], [[0, 1]])


if __name__ == "__main__":
    unittest.main()
