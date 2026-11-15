"""Minimal readers for the two source formats: legacy VTK PolyData (SPL-PNL atlas) and Wavefront OBJ (BodyParts3D)."""
import re
import numpy as np


def read_vtk_polydata(path):
    data = open(path, "rb").read()
    head_end = data.index(b"POINTS")
    binary = b"BINARY" in data[:head_end]
    if not binary:
        raise ValueError(f"{path}: ASCII VTK not supported")
    pos = head_end
    verts, faces = None, []

    def line():
        nonlocal pos
        end = data.index(b"\n", pos)
        out = data[pos:end].decode("ascii", "replace").strip()
        pos = end + 1
        return out

    while pos < len(data):
        hdr = line()
        if not hdr:
            continue
        tok = hdr.split()
        key = tok[0]
        if key == "POINTS":
            n = int(tok[1])
            dt = {"float": ">f4", "double": ">f8"}[tok[2]]
            size = n * 3 * np.dtype(dt).itemsize
            verts = np.frombuffer(data, dt, n * 3, pos).reshape(n, 3).astype(np.float64)
            pos += size
        elif key in ("POLYGONS", "TRIANGLE_STRIPS", "LINES", "VERTICES"):
            ncell, total = int(tok[1]), int(tok[2])
            arr = np.frombuffer(data, ">i4", total, pos)
            pos += total * 4
            if key in ("LINES", "VERTICES"):
                continue
            i = 0
            for _ in range(ncell):
                k = arr[i]
                ids = arr[i + 1 : i + 1 + k]
                i += 1 + k
                if key == "POLYGONS":
                    for j in range(1, k - 1):
                        faces.append((ids[0], ids[j], ids[j + 1]))
                else:
                    for j in range(k - 2):
                        a, b, c = ids[j], ids[j + 1], ids[j + 2]
                        faces.append((a, b, c) if j % 2 == 0 else (b, a, c))
        else:
            break  # POINT_DATA / CELL_DATA: normals are recomputed downstream
    return verts, np.asarray(faces, dtype=np.int64)


def read_obj(path):
    verts, faces = [], []
    with open(path, encoding="utf-8", errors="replace") as fh:
        for ln in fh:
            if ln.startswith("v "):
                verts.append([float(x) for x in ln.split()[1:4]])
            elif ln.startswith("f "):
                ids = [int(re.split("/", t)[0]) - 1 for t in ln.split()[1:]]
                for j in range(1, len(ids) - 1):
                    faces.append((ids[0], ids[j], ids[j + 1]))
    return np.asarray(verts, dtype=np.float64), np.asarray(faces, dtype=np.int64)
