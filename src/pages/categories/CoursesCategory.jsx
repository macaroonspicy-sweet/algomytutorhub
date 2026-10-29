import React from 'react';
import CategoryPage from './CategoryPage';
export default function CoursesCategory() {
  return (
    <CategoryPage
      title="Courses"
      subtitle="Manage available courses for tutors"
      entityName="CourseCategory"
      color="bg-chart-3"
    />
  );
}