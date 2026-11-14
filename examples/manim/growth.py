# Example Manim scene for mograph's optional `manim` scene type. Brand colours arrive as env vars.
import os
from manim import *

BG, FG, AC, AC2 = (os.environ.get(k, d) for k, d in [("MOGRAPH_BG", "#F3F1FD"), ("MOGRAPH_FG", "#241F45"), ("MOGRAPH_AC", "#FF7A45"), ("MOGRAPH_AC2", "#6A5CFF")])

class Growth(Scene):
    def construct(self):
        ax = Axes(x_range=[0, 6, 1], y_range=[0, 36, 12], x_length=10, y_length=5.2, axis_config={"color": FG, "stroke_width": 3})
        curve = ax.plot(lambda x: x ** 2, x_range=[0, 6], color=AC2, stroke_width=10)
        area = ax.get_area(curve, x_range=[0, 6], color=AC2, opacity=0.18)
        dot = Dot(ax.c2p(0, 0), color=AC, radius=0.14)
        self.play(Create(ax), run_time=0.8)
        self.play(Create(curve), FadeIn(area), MoveAlongPath(dot, curve), run_time=2.2, rate_func=smooth)
        self.wait(0.5)
